import { NextResponse } from "next/server";
import { getMatrixSnapshot } from "@/lib/ccxt-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const snapshot = await getMatrixSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        live_rsi: 0,
        live_atr: 0,
        live_vwap: 0,
        live_price: 0,
        rsi_prev: 0,
        breakoutLock: false,
        lockText: null,
        exhaustionDrop: false,
        recoverFromOversold: false,
        signal: "WAIT",
        recommendation: message,
        sellPlan: null,
        buyPlan: null,
        armedPlan: null,
        venues: [],
        bidsNear: 0,
        asksNear: 0,
        heavySell: false,
        heavyBuy: false,
        bars: 0,
        scannedAt: new Date().toISOString(),
        source: "error",
        alertPing: false,
        emailStatus: "idle",
        emailDetail: "",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
