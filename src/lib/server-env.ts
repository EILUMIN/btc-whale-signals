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

export function getDiscordWebhookUrl(): string {
  assertServer();
  // Server secret only. Never fall back to NEXT_PUBLIC_DISCORD_WEBHOOK_URL.
  return process.env.DISCORD_WEBHOOK_URL?.trim() ?? "";
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
