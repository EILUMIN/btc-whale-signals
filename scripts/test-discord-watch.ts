import { candleKeyUnix, emptyOnchainFlow, type M1Snapshot } from "../src/lib/m1";
import { loadServerEnv } from "../src/lib/server-env";
import {
  WATCH_TEST_SUBJECT,
  applyM1AlertLatch,
  formatWatchTestAlert,
  peekAlertLatch,
  resetAlertLatch,
  shouldFireM1Alert,
} from "../src/lib/signal-alert";

loadServerEnv();

function redact(value: unknown): string {
  const text = String(value ?? "");
  return text.replace(/https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/[^\s]+/gi, "[webhook-redacted]");
}

function watchSnap(candleKey: number): M1Snapshot {
  return {
    ok: true,
    error: null,
    timeframe: "1m",
    candleKey,
    live_price: 81_433.09,
    live_vwap: 81_558.75,
    cvd: -1.77,
    cvdLabel: "selling delta",
    signal: "WATCH",
    recommendation: "WATCH test — not a trade.",
    spoofChecked: false,
    spoofCleared: false,
    armedPlan: null,
    puPrimePlan: null,
    walls: [],
    askWalls: [],
    bidWalls: [],
    bars: [],
    flow: emptyOnchainFlow(),
    venues: [
      { name: "binance", symbol: "BTC/USDT", last: 81_399.48, ok: true },
    ],
    scannedAt: new Date().toISOString(),
    source: "binance + coinbase + kraken",
  };
}

function assertNoSecret(snap: M1Snapshot) {
  const blob = JSON.stringify(snap);
  if (/discord(?:app)?\.com\/api\/webhooks/i.test(blob)) {
    throw new Error("snapshot leaked DISCORD_WEBHOOK_URL to the payload");
  }
}

async function main() {
  const candle = candleKeyUnix();
  const snap = watchSnap(candle);
  const body = formatWatchTestAlert(snap);

  if (body.subject !== WATCH_TEST_SUBJECT) {
    throw new Error(`subject ${body.subject}`);
  }
  for (const line of [
    "Discord webhook works",
    "one-alert-per-M1-candle logic works",
    "duplicate alerts are blocked",
    "Gmail alerts still work",
  ]) {
    if (!body.text.includes(line)) {
      throw new Error(`WATCH body missing: ${line}`);
    }
  }

  if (!shouldFireM1Alert("WATCH", candle, null)) {
    throw new Error("first WATCH on a candle must fire");
  }
  if (shouldFireM1Alert("WATCH", candle, candle)) {
    throw new Error("duplicate WATCH on the same M1 candle must be blocked");
  }
  if (shouldFireM1Alert("WAIT", candle, null)) {
    throw new Error("WAIT must never send");
  }

  resetAlertLatch(null);
  const first = await applyM1AlertLatch(snap);
  assertNoSecret(first);
  const firstLatch = peekAlertLatch();

  const duplicate = await applyM1AlertLatch({
    ...snap,
    scannedAt: new Date().toISOString(),
  });
  assertNoSecret(duplicate);

  const result = {
    candle,
    watchSubject: body.subject,
    first: {
      ping: Boolean(first.alertPing),
      email: first.emailStatus,
      emailDetail: redact(first.emailDetail),
      discord: first.discordStatus,
      discordDetail: redact(first.discordDetail),
      latch: firstLatch,
    },
    duplicate: {
      ping: Boolean(duplicate.alertPing),
      email: duplicate.emailStatus,
      emailDetail: redact(duplicate.emailDetail),
      discord: duplicate.discordStatus,
      discordDetail: redact(duplicate.discordDetail),
      latchUnchanged: peekAlertLatch() === firstLatch,
    },
    webhookConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL?.trim()),
    gmailConfigured: Boolean(
      process.env.EMAIL_SENDER?.trim() && process.env.EMAIL_APP_PASSWORD?.trim()
    ),
  };

  console.log(JSON.stringify(result, null, 2));

  if (!first.alertPing) throw new Error("first WATCH did not arm the latch");
  if (first.discordStatus !== "sent") {
    throw new Error(`Discord WATCH failed: ${first.discordStatus} ${first.discordDetail}`);
  }
  if (first.emailStatus !== "sent") {
    throw new Error(`Gmail WATCH failed: ${first.emailStatus} ${first.emailDetail}`);
  }
  if (duplicate.alertPing) throw new Error("duplicate WATCH pinged again");
  if (duplicate.discordStatus !== "idle" || duplicate.emailStatus !== "idle") {
    throw new Error("duplicate WATCH was not blocked (expected idle/idle)");
  }
  if (!result.duplicate.latchUnchanged) {
    throw new Error("latch moved on the duplicate WATCH");
  }
  console.log("WATCH_TEST_OK");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
