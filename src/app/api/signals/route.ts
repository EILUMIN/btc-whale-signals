import { NextResponse } from "next/server";
import { emptyM1Snapshot, getM1Snapshot } from "@/lib/m1-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const snapshot = await getM1Snapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(emptyM1Snapshot(message), {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
