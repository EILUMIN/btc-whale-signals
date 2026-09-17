import { WHALE_THRESHOLD_BTC } from "@/lib/constants";
import type { ClassifiedTx } from "@/lib/classify";
import { roundPrice, type HourlyCandle } from "@/lib/price";
import type { KeyLevel, SignalSide } from "@/lib/types";

export type DirectionalDecision = {
  signal: SignalSide;
  recommendation: string;
  keyLevel: KeyLevel;
};

function averageTrueRange(candles: HourlyCandle[]) {
  if (candles.length === 0) return null;
  const ranges = candles.map((candle) => candle.high - candle.low);
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

export function decideSignal(
  classified: ClassifiedTx,
  priceUsd: number,
  candles: HourlyCandle[],
  thresholdBtc = WHALE_THRESHOLD_BTC
): DirectionalDecision {
  const atr = averageTrueRange(candles) ?? priceUsd * 0.006;
  const buffer = Math.max(atr * 0.35, priceUsd * 0.002);

  if (classified.movement === "Wallet to Exchange") {
    const resistance = roundPrice(priceUsd);
    return {
      signal: "SELL",
      recommendation: "SELL / SHORT SETUP",
      keyLevel: {
        kind: "resistance",
        price: resistance,
        zoneLow: resistance,
        zoneHigh: roundPrice(resistance + buffer),
        note: `Inflow (≥ ${thresholdBtc} BTC) papuntang exchange — posible ang selling pressure sa paligid ng presyong ito.`,
      },
    };
  }

  if (classified.movement === "Exchange to Wallet") {
    const support = roundPrice(priceUsd);
    return {
      signal: "BUY",
      recommendation: "BUY / ACCUMULATION",
      keyLevel: {
        kind: "support",
        price: support,
        zoneLow: roundPrice(support - buffer),
        zoneHigh: support,
        note: `Outflow (≥ ${thresholdBtc} BTC) palabas ng exchange papuntang wallet — posible ang accumulation sa paligid ng presyong ito.`,
      },
    };
  }

  if (classified.movement === "Exchange Internal") {
    return {
      signal: "WATCH",
      recommendation: "WATCH / EXCHANGE INTERNAL",
      keyLevel: {
        kind: "none",
        price: roundPrice(priceUsd),
        zoneLow: roundPrice(priceUsd),
        zoneHigh: roundPrice(priceUsd),
        note: "Galaw sa pagitan ng exchange wallets — hindi directional buy/sell.",
      },
    };
  }

  return {
    signal: "WATCH",
    recommendation: "WATCH / UNLABELED WALLET",
    keyLevel: {
      kind: "none",
      price: roundPrice(priceUsd),
      zoneLow: roundPrice(priceUsd),
      zoneHigh: roundPrice(priceUsd),
      note: "Malaking transaksyon pero hindi identified ang exchange cluster. Walang BUY/SELL hangga't hindi malinaw ang destination.",
    },
  };
}
