import { roundPrice } from "@/lib/price";
import type { WhaleSignal } from "@/lib/types";

/** User-requested take-profit: 90% from entry. */
export const TAKE_PROFIT_PCT = 0.9;

export type TradePlan = {
  side: "BUY" | "SELL";
  entry: number;
  exit: number;
  stop: number;
  profitPct: number;
  whenUnix: number;
};

export function tradePlanFor(signal: WhaleSignal): TradePlan | null {
  if (signal.signal !== "BUY" && signal.signal !== "SELL") return null;
  const entry = roundPrice(signal.priceUsd);
  const minGap = roundPrice(Math.max(entry * 0.005, 50));
  if (signal.signal === "BUY") {
    const stop = roundPrice(Math.min(signal.keyLevel.zoneLow, entry - minGap));
    const exit = roundPrice(entry * (1 + TAKE_PROFIT_PCT));
    return {
      side: "BUY",
      entry,
      exit,
      stop,
      profitPct: TAKE_PROFIT_PCT * 100,
      whenUnix: signal.timestampUnix,
    };
  }
  const stop = roundPrice(Math.max(signal.keyLevel.zoneHigh, entry + minGap));
  const exit = roundPrice(entry * (1 - TAKE_PROFIT_PCT));
  return {
    side: "SELL",
    entry,
    exit,
    stop,
    profitPct: TAKE_PROFIT_PCT * 100,
    whenUnix: signal.timestampUnix,
  };
}
