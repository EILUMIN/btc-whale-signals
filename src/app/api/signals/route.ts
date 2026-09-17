import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        price: null,
        thresholdBtc: Number(process.env.WHALE_THRESHOLD_BTC ?? 500),
        lastScanAt: null,
        scanning: false,
        liveFeed: false,
        trackedWallets: 0,
        stats: { buy: 0, sell: 0, watch: 0, total: 0 },
        signals: [],
        tape: [],
      },
      { status: 500 }
    );
  }
}
