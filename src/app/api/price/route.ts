import { NextResponse } from "next/server";
import { fetchLivePrice } from "@/lib/price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const price = await fetchLivePrice();
    return NextResponse.json(price, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        usd: null,
        change24hPct: null,
        high24h: null,
        low24h: null,
        source: "unavailable",
        timestamp: new Date().toISOString(),
        error: message,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
