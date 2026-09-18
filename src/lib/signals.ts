import { WHALE_THRESHOLD_BTC } from "@/lib/constants";
import type { ClassifiedTx } from "@/lib/classify";
import { roundPrice } from "@/lib/price";
import type { KeyLevel, SignalSide } from "@/lib/types";

export type DirectionalDecision = {
  signal: SignalSide;
  recommendation: string;
  keyLevel: KeyLevel;
};

const ZONE_PCT = 0.0025;

export function decideSignal(
  classified: ClassifiedTx,
  priceUsd: number,
  _unusedCandles: unknown,
  thresholdBtc = WHALE_THRESHOLD_BTC
): DirectionalDecision {
  const buffer = Math.max(priceUsd * ZONE_PCT, 50);

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
        noteKey: "inflow",
        note: `Inflow (≥ ${thresholdBtc} BTC) to an exchange — selling pressure is possible around this price.`,
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
        noteKey: "outflow",
        note: `Outflow (≥ ${thresholdBtc} BTC) from an exchange to a wallet — accumulation is possible around this price.`,
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
        noteKey: "internal",
        note: "Move between exchange wallets — not a directional buy/sell.",
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
      noteKey: "unlabeled",
      note: "Large transfer, but the exchange cluster is unidentified. No BUY/SELL until the destination is clear.",
    },
  };
}
