import nodemailer from "nodemailer";
import type { M1Snapshot, M1Signal, RiskPlan } from "@/lib/m1";
import {
  getDiscordWebhookUrl,
  getEmailAuth,
} from "@/lib/server-env";

export type EmailStatus = "sent" | "skipped" | "failed" | "idle";

export const M1_ALERT_SUBJECT =
  "[HIGH-CONFIDENCE CONFLUENCE] M1 Whale Signal Alert";

export const WATCH_TEST_SUBJECT = "[WATCH TEST] M1 Whale Signal Desk";

type Latch = {
  emailedCandle: number | null;
};

const g = globalThis as unknown as { __m1AlertLatch?: Latch };

function latch(): Latch {
  if (!g.__m1AlertLatch) {
    g.__m1AlertLatch = { emailedCandle: null };
  }
  return g.__m1AlertLatch;
}

export function shouldFireM1Alert(
  signal: M1Signal,
  candleKey: number,
  emailedCandle: number | null
): boolean {
  if (signal !== "BUY" && signal !== "SELL" && signal !== "WATCH") return false;
  if (!Number.isFinite(candleKey)) return false;
  return emailedCandle !== candleKey;
}

export function formatM1Email(
  plan: RiskPlan,
  snap: M1Snapshot
): { subject: string; text: string } {
  const side = plan.side;
  const pu = snap.puPrimePlan;
  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const puLines = pu
    ? [
        "PuPrime Levels (MT4/MT5 Guide)",
        `Entry: ${money(pu.entry)}  (−$${pu.gapUsd} gap vs exchange)`,
        `Stop (other side of wall + $${pu.spreadUsd} spread): ${money(pu.stop)}`,
        `Take Profit (1:3 R:R): ${money(pu.takeProfit)}`,
        `Volume: Use ${pu.sizeLots.toFixed(2)} Lots`,
        `Risk: $${pu.riskUsd.toFixed(2)}`,
        "",
      ]
    : [];
  const text = [
    M1_ALERT_SUBJECT,
    "",
    `${side} confluence on the 1-minute chart.`,
    "On-chain flow + order-book wall + CVD agreed. 5-second anti-spoof passed.",
    "",
    `Side: ${side}`,
    "",
    "Exchange Levels (Binance/Coinbase Data)",
    `Entry (Global VWAP at trigger): ${money(plan.entry)}`,
    `Stop (other side of whale wall): ${money(plan.stop)}`,
    `Take Profit (1:3 R:R): ${money(plan.takeProfit)}`,
    `Safe size (1% of $1,000): ${plan.sizeBtc.toFixed(6)} BTC`,
    `Notional: ${money(plan.notionalUsd)}`,
    `Risk: $${plan.riskUsd.toFixed(2)}`,
    `Whale wall: ${money(plan.wallPrice)}`,
    "",
    ...puLines,
    `On-chain labeled inflow: ${snap.flow.inflows.toFixed(2)} BTC`,
    `On-chain labeled outflow: ${snap.flow.outflows.toFixed(2)} BTC`,
    `Unlabeled (wallet↔wallet): ${snap.flow.unlabeled.toFixed(2)} BTC`,
    `Internal (exchange↔exchange): ${snap.flow.internal.toFixed(2)} BTC`,
    `Pending mempool: ${snap.flow.pendingBtc.toFixed(2)} BTC`,
    `Confirmed: ${snap.flow.confirmedBtc.toFixed(2)} BTC`,
    `Watched wallets: ${snap.flow.watchedWallets}`,
    `Esplora: ${snap.flow.esploraSource}`,
    `CVD (M1): ${snap.cvd.toFixed(2)} (${snap.cvdLabel})`,
    `Live price: ${money(snap.live_price)}`,
    `M1 candle: ${snap.candleKey}`,
    `venues: ${snap.source}`,
    `when: ${snap.scannedAt}`,
    "",
    "Not financial advice.",
  ].join("\n");
  return { subject: M1_ALERT_SUBJECT, text };
}

export function formatWatchTestAlert(snap: M1Snapshot): {
  subject: string;
  text: string;
} {
  const text = [
    WATCH_TEST_SUBJECT,
    "",
    "WATCH test — not a trade. No BUY/SELL confluence.",
    "",
    "This message confirms:",
    "- Discord webhook works",
    "- one-alert-per-M1-candle logic works",
    "- duplicate alerts are blocked",
    "- Gmail alerts still work",
    "",
    `Side: WATCH`,
    `M1 candle: ${snap.candleKey}`,
    `Live price: $${snap.live_price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    `venues: ${snap.source}`,
    `when: ${snap.scannedAt}`,
    "",
    "Same server-side latch as live BUY/SELL: one Discord post and one Gmail",
    "per M1 candle. A second fire on this candle is dropped.",
    "",
    "Not financial advice.",
  ].join("\n");
  return { subject: WATCH_TEST_SUBJECT, text };
}

export async function sendGmail(
  subject: string,
  text: string
): Promise<{ status: EmailStatus; detail: string }> {
  const { sender, password, receiver } = getEmailAuth();
  if (!sender || !password) {
    return {
      status: "skipped",
      detail:
        "EMAIL_SENDER / EMAIL_APP_PASSWORD missing in .env — audio ping still fires.",
    };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: sender, pass: password },
    });
    await transporter.sendMail({
      from: `Whale Signal Desk <${sender}>`,
      to: receiver,
      subject,
      text,
    });
    return { status: "sent", detail: `emailed ${receiver}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", detail: message.slice(0, 200) };
  }
}

export async function sendM1Email(
  plan: RiskPlan,
  snap: M1Snapshot
): Promise<{ status: EmailStatus; detail: string }> {
  const { subject, text } = formatM1Email(plan, snap);
  return sendGmail(subject, text);
}

export function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const discordHost =
      host === "discord.com" ||
      host === "discordapp.com" ||
      host.endsWith(".discord.com") ||
      host.endsWith(".discordapp.com");
    return discordHost && url.pathname.includes("/api/webhooks/");
  } catch {
    return false;
  }
}

export async function postDiscord(
  content: string
): Promise<{ status: EmailStatus; detail: string }> {
  const webhook = getDiscordWebhookUrl();
  if (!webhook) {
    return {
      status: "skipped",
      detail: "DISCORD_WEBHOOK_URL missing — email/ping still fire.",
    };
  }
  if (!isDiscordWebhookUrl(webhook)) {
    return {
      status: "failed",
      detail: "DISCORD_WEBHOOK_URL must be a discord.com webhook.",
    };
  }
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Whale Signal Desk",
        content,
      }),
    });
    if (!response.ok) {
      return {
        status: "failed",
        detail: `discord ${response.status}`,
      };
    }
    return { status: "sent", detail: "discord webhook posted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", detail: message.slice(0, 200) };
  }
}

export async function sendDiscordAlert(
  plan: RiskPlan,
  snap: M1Snapshot
): Promise<{ status: EmailStatus; detail: string }> {
  const { subject, text } = formatM1Email(plan, snap);
  return postDiscord(`${subject}\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\``);
}

export async function sendWatchTestChannels(
  snap: M1Snapshot
): Promise<{
  email: { status: EmailStatus; detail: string };
  discord: { status: EmailStatus; detail: string };
}> {
  const { subject, text } = formatWatchTestAlert(snap);
  const email = await sendGmail(subject, text);
  const discord = await postDiscord(
    `${subject}\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\``
  );
  return { email, discord };
}

export async function applyM1AlertLatch(
  snap: M1Snapshot
): Promise<M1Snapshot> {
  const state = latch();
  let ping = false;
  let email: EmailStatus = "idle";
  let detail = "";
  let discord: EmailStatus = "idle";
  let discordDetail = "";

  if (shouldFireM1Alert(snap.signal, snap.candleKey, state.emailedCandle)) {
    ping = true;
    if (snap.signal === "WATCH") {
      const result = await sendWatchTestChannels(snap);
      email = result.email.status;
      detail = result.email.detail;
      discord = result.discord.status;
      discordDetail = result.discord.detail;
    } else if (snap.armedPlan) {
      const result = await sendM1Email(snap.armedPlan, snap);
      email = result.status;
      detail = result.detail;
      const hook = await sendDiscordAlert(snap.armedPlan, snap);
      discord = hook.status;
      discordDetail = hook.detail;
    } else {
      email = "skipped";
      detail = "confluence without a sized plan";
      discord = "skipped";
      discordDetail = "confluence without a sized plan";
    }
    state.emailedCandle = snap.candleKey;
  }

  return {
    ...snap,
    alertPing: ping,
    emailStatus: email,
    emailDetail: detail,
    discordStatus: discord,
    discordDetail: discordDetail,
  };
}

/** Test helper — do not use in production routes. */
export function resetAlertLatch(candleKey: number | null = null) {
  g.__m1AlertLatch = { emailedCandle: candleKey };
}

export function peekAlertLatch(): number | null {
  return latch().emailedCandle;
}
