import nodemailer from "nodemailer";
import type { M1Snapshot, M1Signal, RiskPlan } from "@/lib/m1";

export type EmailStatus = "sent" | "skipped" | "failed" | "idle";

export const M1_ALERT_SUBJECT =
  "[HIGH-CONFIDENCE CONFLUENCE] M1 Whale Signal Alert";

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
  if (signal !== "BUY" && signal !== "SELL") return false;
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
    `On-chain inflow: ${snap.flow.inflows.toFixed(2)} BTC`,
    `On-chain outflow: ${snap.flow.outflows.toFixed(2)} BTC`,
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

export async function sendM1Email(
  plan: RiskPlan,
  snap: M1Snapshot
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
  const { subject, text } = formatM1Email(plan, snap);
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

export async function applyM1AlertLatch(
  snap: M1Snapshot
): Promise<M1Snapshot> {
  const state = latch();
  let ping = false;
  let email: EmailStatus = "idle";
  let detail = "";

  if (shouldFireM1Alert(snap.signal, snap.candleKey, state.emailedCandle)) {
    ping = true;
    if (snap.armedPlan) {
      const result = await sendM1Email(snap.armedPlan, snap);
      email = result.status;
      detail = result.detail;
    } else {
      email = "skipped";
      detail = "confluence without a sized plan";
    }
    state.emailedCandle = snap.candleKey;
  }

  return {
    ...snap,
    alertPing: ping,
    emailStatus: email,
    emailDetail: detail,
  };
}

/** Test helper — do not use in production routes. */
export function resetAlertLatch(candleKey: number | null = null) {
  g.__m1AlertLatch = { emailedCandle: candleKey };
}
