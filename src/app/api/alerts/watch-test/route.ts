import { NextResponse } from "next/server";
import { candleKeyUnix, emptyOnchainFlow } from "@/lib/m1";
import { fetchLivePrice } from "@/lib/price";
import { applyM1AlertLatch } from "@/lib/signal-alert";
import { describeDiscordWebhookConfig } from "@/lib/server-env";
import {
  readWatchTestToken,
  watchTestTokenAuthorized,
} from "@/lib/watch-test-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const g = globalThis as unknown as { __watchTestCooldown?: number };
const COOLDOWN_MS = 60_000;

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, signal: "WATCH", error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (!watchTestTokenAuthorized(readWatchTestToken(request))) {
    return deny(401, "unauthorized");
  }

  const now = Date.now();
  if (g.__watchTestCooldown && now - g.__watchTestCooldown < COOLDOWN_MS) {
    return deny(429, "watch test cooldown");
  }
  g.__watchTestCooldown = now;

  let live = 0;
  let source = "production watch test";
  try {
    const price = await fetchLivePrice();
    live = price.usd;
    source = price.source;
  } catch {
    // still send WATCH; price is only context
  }

  // Body is ignored. This route can only emit WATCH — never BUY/SELL.
  const snap = await applyM1AlertLatch({
    ok: true,
    error: null,
    timeframe: "1m",
    candleKey: candleKeyUnix(now),
    live_price: live,
    live_vwap: live,
    cvd: 0,
    cvdLabel: "flat delta",
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
    venues: [],
    scannedAt: new Date().toISOString(),
    scanStatus: "ok",
    source,
  });

  if (snap.discordStatus !== "sent") {
    g.__watchTestCooldown = 0;
  }

  const blob = JSON.stringify(snap);
  if (/discord(?:app)?\.com\/api\/webhooks/i.test(blob)) {
    return deny(500, "refusing to return webhook material");
  }

  return NextResponse.json(
    {
      ok: true,
      signal: "WATCH",
      candleKey: snap.candleKey,
      alertPing: Boolean(snap.alertPing),
      discordStatus: snap.discordStatus,
      discordDetail: snap.discordDetail,
      emailStatus: snap.emailStatus,
      webhook:
        snap.discordStatus === "sent"
          ? undefined
          : describeDiscordWebhookConfig(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export function GET(request: Request) {
  if (!watchTestTokenAuthorized(readWatchTestToken(request))) {
    return deny(405, "POST only");
  }
  const probe = describeDiscordWebhookConfig();
  return NextResponse.json(
    {
      ok: true,
      signal: "WATCH",
      mode: "probe",
      sent: false,
      webhook: probe,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
