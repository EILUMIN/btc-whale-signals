import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error("Alert credentials are server-side only.");
  }
}

/**
 * Load `.env` into process.env without overriding real environment
 * values. Never import this module from a Client Component.
 */
export function loadServerEnv(root = process.cwd()) {
  assertServer();
  const path = resolve(root, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || key.startsWith("NEXT_PUBLIC_")) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

const DISCORD_WEBHOOK_RE =
  /https:\/\/(?:[a-z0-9-]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_.-]+/i;

/** Strip quotes, key prefixes, and curl wrapping Vercel sometimes stores. */
export function normalizeDiscordWebhookUrl(raw: string): string {
  let value = raw.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (/^DISCORD_WEBHOOK_URL=/i.test(value)) {
    value = value.replace(/^DISCORD_WEBHOOK_URL=/i, "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
  }
  value = value.replace(/\\\//g, "/").replace(/^<|>$/g, "").trim();
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      const parsed = JSON.parse(value) as { url?: unknown };
      if (typeof parsed.url === "string") value = parsed.url.trim();
    } catch {
      // keep original
    }
  }
  if (value.startsWith("http://") && /discord(?:app)?\.com/i.test(value)) {
    value = `https://${value.slice("http://".length)}`;
  }
  const match = value.match(DISCORD_WEBHOOK_RE);
  if (match) return match[0];
  if (/^\d{5,}\/[A-Za-z0-9_.-]+$/.test(value)) {
    return `https://discord.com/api/webhooks/${value}`;
  }
  return value;
}

export function getDiscordWebhookUrl(): string {
  assertServer();
  // Server secret only. Never fall back to NEXT_PUBLIC_DISCORD_WEBHOOK_URL.
  const raw = process.env.DISCORD_WEBHOOK_URL?.trim() ?? "";
  return raw ? normalizeDiscordWebhookUrl(raw) : "";
}

/** Shape of the server webhook secret. Never returns the URL or token. */
export function describeDiscordWebhookConfig(): {
  configured: boolean;
  length: number;
  quoted: boolean;
  startsWithHttp: boolean;
  mentionsDiscord: boolean;
  mentionsWebhooks: boolean;
  parseOk: boolean;
  protocol: string;
  hostKind: "discord" | "discordapp" | "other" | "none";
  pathHasWebhook: boolean;
  normalizedValid: boolean;
} {
  assertServer();
  const raw = process.env.DISCORD_WEBHOOK_URL ?? "";
  const trimmed = raw.trim();
  const normalized = trimmed ? normalizeDiscordWebhookUrl(trimmed) : "";
  let protocol = "";
  let host = "";
  let path = "";
  let parseOk = false;
  try {
    const url = new URL(normalized);
    protocol = url.protocol.replace(":", "");
    host = url.hostname.toLowerCase();
    path = url.pathname.toLowerCase();
    parseOk = true;
  } catch {
    parseOk = false;
  }
  const hostKind =
    host === "discord.com" || host.endsWith(".discord.com")
      ? "discord"
      : host === "discordapp.com" || host.endsWith(".discordapp.com")
        ? "discordapp"
        : host
          ? "other"
          : "none";
  return {
    configured: Boolean(trimmed),
    length: trimmed.length,
    quoted: trimmed.startsWith('"') || trimmed.startsWith("'"),
    startsWithHttp: /^https?:\/\//i.test(trimmed),
    mentionsDiscord: /discord/i.test(trimmed),
    mentionsWebhooks: /webhooks/i.test(trimmed),
    parseOk,
    protocol,
    hostKind,
    pathHasWebhook: path.includes("webhook"),
    normalizedValid:
      parseOk &&
      protocol === "https" &&
      (hostKind === "discord" || hostKind === "discordapp") &&
      (path.includes("/api/webhooks/") || /\/api\/v\d+\/webhooks\//.test(path)),
  };
}

export function getEmailAuth(): {
  sender: string;
  password: string;
  receiver: string;
} {
  assertServer();
  return {
    sender: process.env.EMAIL_SENDER?.trim() ?? "",
    password: process.env.EMAIL_APP_PASSWORD?.trim() ?? "",
    receiver:
      process.env.EMAIL_RECEIVER?.trim() || "elmer.whaledesk@gmail.com",
  };
}
