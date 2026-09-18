import nodemailer from "nodemailer";
import type { MatrixSide, MatrixSnapshot, RiskPlan } from "@/lib/matrix";

export type EmailStatus = "sent" | "skipped" | "failed" | "idle";

export type AlertResult = {
  ping: boolean;
  email: EmailStatus;
  detail: string;
};

type Latch = {
  prev: MatrixSide;
  emailedThisArm: boolean;
};

const g = globalThis as unknown as { __whaleAlertLatch?: Latch };

function latch(): Latch {
  if (!g.__whaleAlertLatch) {
    g.__whaleAlertLatch = { prev: "WAIT", emailedThisArm: false };
  }
  return g.__whaleAlertLatch;
}

export function formatSellEmail(plan: RiskPlan, snap: MatrixSnapshot): {
  subject: string;
  text: string;
} {
  const subject = "Whale Signal Desk — SELL / SHORT SETUP";
  const text = [
    "SELL / SHORT SETUP",
    "",
    "The generator left HOLDING (breakout lock) after RSI dropped back below 70.",
    "Numbers are live Global VWAP — not a stale whale wall.",
    "",
    `Entry (Global VWAP): $${plan.entry.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Take Profit (1:3 Reward): $${plan.takeProfit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Stop Loss (1.5× ATR): $${plan.stop.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Safe size (1% of $1,000): ${plan.sizeBtc.toFixed(4)} BTC`,
    `Notional: $${plan.notionalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Risk: $${plan.riskUsd.toFixed(2)}`,
    "",
    `live_rsi: ${snap.live_rsi.toFixed(2)} (prev ${snap.rsi_prev.toFixed(2)})`,
    `live_atr: $${snap.live_atr.toFixed(2)}`,
    `live_price: $${snap.live_price.toFixed(2)}`,
    `venues: ${snap.source}`,
    `when: ${snap.scannedAt}`,
    "",
    "Not financial advice.",
  ].join("\n");
  return { subject, text };
}

/** HOLDING → SELL / SHORT SETUP fires once per arm. */
export function shouldFireSellAlert(
  prev: MatrixSide,
  next: MatrixSide,
  emailedThisArm: boolean
): boolean {
  return prev === "HOLD" && next === "SELL" && !emailedThisArm;
}

export async function sendEmailAlert(
  plan: RiskPlan,
  snap: MatrixSnapshot
): Promise<{ status: EmailStatus; detail: string }> {
  const sender = process.env.EMAIL_SENDER?.trim();
  const password = process.env.EMAIL_APP_PASSWORD?.trim();
  const receiver =
    process.env.EMAIL_RECEIVER?.trim() || "elmer.whaledesk@gmail.com";
  if (!sender || !password) {
    return {
      status: "skipped",
      detail:
        "EMAIL_SENDER / EMAIL_APP_PASSWORD missing in .env — audio ping still fires.",
    };
  }
  const { subject, text } = formatSellEmail(plan, snap);
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

export async function applySellAlertLatch(
  snap: MatrixSnapshot
): Promise<MatrixSnapshot> {
  const state = latch();
  const next = snap.signal;
  let ping = false;
  let email: EmailStatus = "idle";
  let detail = "";

  if (shouldFireSellAlert(state.prev, next, state.emailedThisArm)) {
    ping = true;
    const plan = snap.armedPlan ?? snap.sellPlan;
    if (plan) {
      const result = await sendEmailAlert(plan, snap);
      email = result.status;
      detail = result.detail;
    } else {
      email = "skipped";
      detail = "no sell plan";
    }
    state.emailedThisArm = true;
  }

  if (next === "HOLD") {
    state.emailedThisArm = false;
  }
  state.prev = next;

  return {
    ...snap,
    alertPing: ping,
    emailStatus: email,
    emailDetail: detail,
  };
}

/** Test helper — do not use in production routes. */
export function resetAlertLatch(prev: MatrixSide = "WAIT") {
  g.__whaleAlertLatch = { prev, emailedThisArm: false };
}
