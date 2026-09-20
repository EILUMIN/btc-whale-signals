import { NextResponse } from "next/server";
import { paperStats } from "@/lib/paper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(paperStats(), {
    headers: { "Cache-Control": "no-store" },
  });
}
