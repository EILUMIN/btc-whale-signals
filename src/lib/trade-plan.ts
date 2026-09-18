import { roundPrice } from "@/lib/price";
import type { WhaleSignal } from "@/lib/types";

/**
 * Take-profit is 90% of a 3R move from entry→stop.
 * It is NOT 90% of Bitcoin's spot price (that bug printed $6,493 on a $65k short).
 */
export const TAKE_PROFIT_PCT = 0.9;
export const RISK_REWARD = 3;
export const MIN_STOP_PCT = 0.005;
export const MAX_ZONE_STOP_PCT = 0.03;

export type TradePlan = {
  side: "BUY" | "SELL";
  entry: number;
  exit: number;
  stop: number;
  whalePrice: number;
  usedLivePrice: boolean;
  stalePrint: boolean;
  profitPct: number;
  rMultiple: number;
  riskUsd: number;
  whenUnix: number;
  liveWhenUnix: number;
};

function minGapFor(entry: number) {
  return roundPrice(Math.max(entry * MIN_STOP_PCT, 50));
}

function usableZoneStop(
  side: "BUY" | "SELL",
  entry: number,
  zonePrice: number
) {
  const maxDistance = entry * MAX_ZONE_STOP_PCT;
  if (side === "BUY") {
    if (zonePrice >= entry) return null;
    if (entry - zonePrice > maxDistance) return null;
    return zonePrice;
  }
  if (zonePrice <= entry) return null;
  if (zonePrice - entry > maxDistance) return null;
  return zonePrice;
}

export function tradePlanFor(
  signal: WhaleSignal,
  liveUsd?: number | null
): TradePlan | null {
  if (signal.signal !== "BUY" && signal.signal !== "SELL") return null;

  const whalePrice = roundPrice(signal.priceUsd);
  const hasLive = typeof liveUsd === "number" && Number.isFinite(liveUsd) && liveUsd > 0;
  const entry = roundPrice(hasLive ? liveUsd : whalePrice);
  const usedLivePrice = hasLive;
  const liveWhenUnix = Math.floor(Date.now() / 1000);
  const stalePrint =
    usedLivePrice && Math.abs(entry - whalePrice) / Math.max(whalePrice, 1) >= 0.015;

  const minGap = minGapFor(entry);
  const rMultiple = roundPrice(TAKE_PROFIT_PCT * RISK_REWARD);

  if (signal.signal === "BUY") {
    const zoneStop =
      signal.keyLevel.kind === "support"
        ? usableZoneStop("BUY", entry, signal.keyLevel.zoneLow)
        : null;
    const stop = roundPrice(
      Math.min(zoneStop ?? entry - minGap, entry - minGap)
    );
    const riskUsd = roundPrice(Math.max(entry - stop, minGap));
    const exit = roundPrice(entry + rMultiple * riskUsd);
    return {
      side: "BUY",
      entry,
      exit,
      stop,
      whalePrice,
      usedLivePrice,
      stalePrint,
      profitPct: TAKE_PROFIT_PCT * 100,
      rMultiple,
      riskUsd,
      whenUnix: signal.timestampUnix,
      liveWhenUnix,
    };
  }

  const zoneStop =
    signal.keyLevel.kind === "resistance"
      ? usableZoneStop("SELL", entry, signal.keyLevel.zoneHigh)
      : null;
  const stop = roundPrice(
    Math.max(zoneStop ?? entry + minGap, entry + minGap)
  );
  const riskUsd = roundPrice(Math.max(stop - entry, minGap));
  const exit = roundPrice(entry - rMultiple * riskUsd);
  return {
    side: "SELL",
    entry,
    exit,
    stop,
    whalePrice,
    usedLivePrice,
    stalePrint,
    profitPct: TAKE_PROFIT_PCT * 100,
    rMultiple,
    riskUsd,
    whenUnix: signal.timestampUnix,
    liveWhenUnix,
  };
}

export function moneyFlowFor(signal: WhaleSignal): "in" | "out" | "none" {
  if (signal.movement === "Wallet to Exchange") return "in";
  if (signal.movement === "Exchange to Wallet") return "out";
  return "none";
}
