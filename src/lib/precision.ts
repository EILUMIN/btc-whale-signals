import { roundPrice } from "@/lib/price";
import { PRICE_STALE_SEC, isStale } from "@/lib/format";
import type { FuturesSnapshot } from "@/lib/futures";
import type { M1Bar, OnchainFlow, WhaleWall } from "@/lib/m1";
import {
  NOTABLE_WALL_BTC,
  WHALE_BTC,
  btcToLots,
  leansBidWall,
  touchesAskWall,
} from "@/lib/m1";
import { loadRiskSettings, type RiskSettings } from "@/lib/risk-settings";

export type PrecisionDirection = "LONG" | "SHORT" | "WAIT";
export type SignalStrength = "high" | "medium" | "blocked";

export type PrecisionPlan = {
  direction: "LONG" | "SHORT";
  strength: SignalStrength;
  entry: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
  tp2: number;
  rrTp1: number;
  rrTp2: number;
  riskUsd: number;
  sizeBtc: number;
  sizeLots: number;
  notionalUsd: number;
  estimatedLossUsd: number;
  leverageHint: string;
  invalidation: string;
  reason: string;
  timestamp: string;
  expiry: string;
  expiryUnix: number;
  paper: boolean;
};

export type PrecisionDecision = {
  direction: PrecisionDirection;
  waitReason: string;
  strength: SignalStrength;
  plan: PrecisionPlan | null;
  dataStale: boolean;
  confirmations: string[];
};

export function confirmedLabeledFlow(flow: OnchainFlow): {
  inflow: number;
  outflow: number;
} {
  let inflow = 0;
  let outflow = 0;
  for (const print of flow.prints) {
    if (!print.confirmed || print.pending) continue;
    if (print.kind === "inflow") inflow += print.btc;
    if (print.kind === "outflow") outflow += print.btc;
  }
  return {
    inflow: Math.round(inflow * 100) / 100,
    outflow: Math.round(outflow * 100) / 100,
  };
}

export function atr(bars: M1Bar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1].close;
    const bar = bars[i];
    trs.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - prev),
        Math.abs(bar.low - prev)
      )
    );
  }
  const slice = trs.slice(-period);
  return slice.reduce((sum, row) => sum + row, 0) / slice.length;
}

export function swingLow(bars: M1Bar[], lookback = 20): number {
  const slice = bars.slice(-lookback);
  if (!slice.length) return 0;
  return Math.min(...slice.map((bar) => bar.low));
}

export function swingHigh(bars: M1Bar[], lookback = 20): number {
  const slice = bars.slice(-lookback);
  if (!slice.length) return 0;
  return Math.max(...slice.map((bar) => bar.high));
}

export function cvdSlope(bars: M1Bar[]): { rising: boolean; falling: boolean } {
  if (bars.length < 8) return { rising: false, falling: false };
  const deltas = bars.map((bar) => bar.buyVolume - bar.sellVolume);
  const earlier = deltas.slice(-8, -4).reduce((sum, n) => sum + n, 0);
  const later = deltas.slice(-4).reduce((sum, n) => sum + n, 0);
  return { rising: later > earlier, falling: later < earlier };
}

function wait(
  reason: string,
  extra: Partial<PrecisionDecision> = {}
): PrecisionDecision {
  return {
    direction: "WAIT",
    waitReason: reason,
    strength: "blocked",
    plan: null,
    dataStale: reason.includes("STALE") || reason.includes("stale"),
    confirmations: [],
    ...extra,
  };
}

function nextLiquidity(
  walls: WhaleWall[],
  side: "bid" | "ask",
  from: number
): WhaleWall | null {
  const pool = walls.filter((wall) => wall.side === side && wall.btc >= NOTABLE_WALL_BTC);
  if (side === "ask") {
    return (
      pool
        .filter((wall) => wall.price > from)
        .sort((a, b) => a.price - b.price)[0] ?? null
    );
  }
  return (
    pool
      .filter((wall) => wall.price < from)
      .sort((a, b) => b.price - a.price)[0] ?? null
  );
}

export function buildPrecisionPlan(input: {
  direction: "LONG" | "SHORT";
  live: number;
  vwap: number;
  bars: M1Bar[];
  walls: WhaleWall[];
  wall: WhaleWall | null;
  reason: string;
  strength: SignalStrength;
  settings?: RiskSettings;
  nowMs?: number;
}): PrecisionPlan | null {
  const settings = input.settings ?? loadRiskSettings();
  const live = input.live;
  const vwap = input.vwap;
  if (!(live > 0) || !(vwap > 0)) return null;
  const vol = atr(input.bars);
  if (vol <= 0) return null;
  if (vol / live > 0.025) return null;

  const low = swingLow(input.bars);
  const high = swingHigh(input.bars);
  const wall = input.wall;
  const buffer = roundPrice(Math.max(vol * 0.25, 8));

  let entry = roundPrice(live);
  if (input.direction === "LONG") {
    const reclaim = Math.max(vwap, low);
    if (Math.abs(live - vwap) / live <= 0.0015) entry = roundPrice(vwap);
    else if (live >= reclaim) entry = roundPrice((live + reclaim) / 2);
  } else {
    const reject = Math.min(vwap, high);
    if (Math.abs(live - vwap) / live <= 0.0015) entry = roundPrice(vwap);
    else if (live <= reject) entry = roundPrice((live + reject) / 2);
  }

  let stop: number;
  let invalidation: string;
  if (input.direction === "LONG") {
    const wallFail = wall ? wall.priceLow - buffer : low - buffer;
    const swingFail = low - buffer;
    stop = roundPrice(Math.min(wallFail, swingFail, entry - vol * 0.6));
    invalidation = `LONG invalid if price loses ${roundPrice(stop)} (swing/wall failure + ATR buffer).`;
  } else {
    const wallFail = wall ? wall.priceHigh + buffer : high + buffer;
    const swingFail = high + buffer;
    stop = roundPrice(Math.max(wallFail, swingFail, entry + vol * 0.6));
    invalidation = `SHORT invalid if price reclaims ${roundPrice(stop)} (swing/wall failure + ATR buffer).`;
  }

  const riskPerBtc = roundPrice(Math.abs(entry - stop));
  if (riskPerBtc < settings.minStopUsd) return null;
  if (input.direction === "LONG" && stop >= entry) return null;
  if (input.direction === "SHORT" && stop <= entry) return null;

  const tp1Horizon =
    input.direction === "LONG"
      ? nextLiquidity(input.walls, "ask", entry)
      : nextLiquidity(input.walls, "bid", entry);
  const tp2Horizon =
    input.direction === "LONG"
      ? nextLiquidity(
          input.walls.filter((w) => w !== tp1Horizon),
          "ask",
          tp1Horizon?.price ?? entry
        )
      : nextLiquidity(
          input.walls.filter((w) => w !== tp1Horizon),
          "bid",
          tp1Horizon?.price ?? entry
        );

  const minTp1Dist = settings.minRr * riskPerBtc;
  const prefTp2Dist = settings.preferredRr * riskPerBtc;
  let tp1: number;
  let tp2: number;
  if (input.direction === "LONG") {
    const wallTp1 = tp1Horizon ? tp1Horizon.priceLow : entry + minTp1Dist;
    tp1 = roundPrice(Math.max(wallTp1, entry + minTp1Dist));
    const wallTp2 = tp2Horizon ? tp2Horizon.priceLow : entry + prefTp2Dist;
    tp2 = roundPrice(Math.max(wallTp2, tp1 + riskPerBtc * 0.5, entry + prefTp2Dist));
  } else {
    const wallTp1 = tp1Horizon ? tp1Horizon.priceHigh : entry - minTp1Dist;
    tp1 = roundPrice(Math.min(wallTp1, entry - minTp1Dist));
    const wallTp2 = tp2Horizon ? tp2Horizon.priceHigh : entry - prefTp2Dist;
    tp2 = roundPrice(Math.min(wallTp2, tp1 - riskPerBtc * 0.5, entry - prefTp2Dist));
  }

  const rrTp1 = roundPrice(Math.abs(tp1 - entry) / riskPerBtc);
  const rrTp2 = roundPrice(Math.abs(tp2 - entry) / riskPerBtc);
  if (rrTp1 + 1e-9 < settings.minRr) return null;

  const sizeBtc =
    Math.round((settings.maxRiskUsd / riskPerBtc) * 1_000_000) / 1_000_000;
  if (!(sizeBtc > 0)) return null;
  const notional = roundPrice(sizeBtc * entry);
  const impliedLev = notional / 1000;
  const now = input.nowMs ?? Date.now();
  const zone = roundPrice(Math.max(vol * 0.15, 6));

  return {
    direction: input.direction,
    strength: input.strength,
    entry,
    entryLow: roundPrice(entry - zone),
    entryHigh: roundPrice(entry + zone),
    stop,
    tp1,
    tp2,
    rrTp1,
    rrTp2,
    riskUsd: settings.maxRiskUsd,
    sizeBtc,
    sizeLots: btcToLots(sizeBtc),
    notionalUsd: notional,
    estimatedLossUsd: settings.maxRiskUsd,
    leverageHint:
      impliedLev > settings.leverageWarn
        ? `Notional ${impliedLev.toFixed(1)}× a $1,000 wallet — leverage warning.`
        : `Notional ${impliedLev.toFixed(1)}× a $1,000 wallet.`,
    invalidation,
    reason: input.reason,
    timestamp: new Date(now).toISOString(),
    expiry: new Date(now + settings.signalExpirySec * 1000).toISOString(),
    expiryUnix: now + settings.signalExpirySec * 1000,
    paper: settings.paperTrading,
  };
}

export function decidePrecisionSetup(input: {
  live: number;
  vwap: number;
  cvd: number;
  bars: M1Bar[];
  bidWalls: WhaleWall[];
  askWalls: WhaleWall[];
  flow: OnchainFlow;
  futures: FuturesSnapshot;
  priceTimestamp: string | null;
  spoofChecked: boolean;
  spoofCleared: boolean;
  venuesOk: number;
  active?: { direction: "LONG" | "SHORT"; expiryUnix: number } | null;
  tradesToday?: number;
  dailyLossUsd?: number;
  settings?: RiskSettings;
  nowMs?: number;
}): PrecisionDecision {
  const settings = input.settings ?? loadRiskSettings();
  const now = input.nowMs ?? Date.now();
  const confirmations: string[] = [];

  if (input.active && now < input.active.expiryUnix) {
    return wait("WAIT — previous signal still active");
  }
  if ((input.tradesToday ?? 0) >= settings.maxTradesPerDay) {
    return wait("WAIT — max trades per day");
  }
  if ((input.dailyLossUsd ?? 0) >= settings.maxDailyLossUsd) {
    return wait("WAIT — max daily loss");
  }
  if (!(input.live > 0) || isStale(input.priceTimestamp, PRICE_STALE_SEC, now)) {
    return wait("WAIT — price data stale");
  }
  if (input.venuesOk < 1) {
    return wait("WAIT — DATA STALE");
  }
  if (!input.futures.ok || input.futures.stale || input.futures.missingCore) {
    return wait(input.futures.waitReason || "WAIT — DATA STALE");
  }
  if (input.bars.length < 16) {
    return wait("WAIT — insufficient futures confirmation");
  }

  const slope = cvdSlope(input.bars);
  const buyingCvd = input.cvd > 0 || slope.rising;
  const sellingCvd = input.cvd < 0 || slope.falling;
  const confirmed = confirmedLabeledFlow(input.flow);
  const bar = input.bars.at(-1) ?? null;
  if (!bar) return wait("WAIT — wall not confirmed");
  const bid = input.bidWalls.find(
    (wall) => wall.btc >= NOTABLE_WALL_BTC && leansBidWall(bar, input.live, wall)
  ) ?? null;
  const ask = input.askWalls.find(
    (wall) => wall.btc >= NOTABLE_WALL_BTC && touchesAskWall(bar, input.live, wall)
  ) ?? null;
  const aboveVwap = input.live >= input.vwap;
  const belowVwap = input.live <= input.vwap;
  const oiUp = input.futures.oiRising === true;
  const takerBuy = input.futures.takerBuyDominant === true;
  const takerSell = input.futures.takerBuyDominant === false;

  const longFlowOk = confirmed.inflow < WHALE_BTC;
  const shortFlowOk = confirmed.outflow < WHALE_BTC;
  if (confirmed.inflow >= WHALE_BTC) {
    confirmations.push("confirmed exchange inflow opposes LONG");
  }
  if (confirmed.outflow >= WHALE_BTC) {
    confirmations.push("confirmed exchange outflow opposes SHORT");
  }

  const longReady =
    buyingCvd &&
    takerBuy &&
    oiUp &&
    aboveVwap &&
    Boolean(bid) &&
    longFlowOk;
  const shortReady =
    sellingCvd &&
    takerSell &&
    oiUp &&
    belowVwap &&
    Boolean(ask) &&
    shortFlowOk;

  if (longReady && shortReady) {
    return wait("WAIT — CVD conflict", { confirmations });
  }
  if (!buyingCvd && !sellingCvd) {
    return wait("WAIT — CVD conflict", { confirmations });
  }
  if (buyingCvd && sellingCvd && input.cvd === 0 && slope.rising === slope.falling) {
    return wait("WAIT — CVD conflict", { confirmations });
  }

  if (!longReady && !shortReady) {
    if (!takerBuy && !takerSell) {
      return wait("WAIT — insufficient futures confirmation", { confirmations });
    }
    if (!oiUp) {
      return wait("WAIT — Open Interest and price do not confirm", {
        confirmations,
      });
    }
    if (!bid && !ask) {
      return wait("WAIT — wall not confirmed", { confirmations });
    }
    if (buyingCvd && !longFlowOk) {
      return wait("WAIT — opposing confirmed flow", { confirmations });
    }
    if (sellingCvd && !shortFlowOk) {
      return wait("WAIT — opposing confirmed flow", { confirmations });
    }
    return wait("WAIT — incomplete confirmation", { confirmations });
  }

  const direction: "LONG" | "SHORT" = longReady ? "LONG" : "SHORT";
  if (direction === "LONG" && !buyingCvd) return wait("WAIT — CVD conflict");
  if (direction === "SHORT" && !sellingCvd) return wait("WAIT — CVD conflict");
  if (direction === "LONG" && takerSell) {
    return wait("WAIT — CVD conflict");
  }
  if (direction === "SHORT" && takerBuy) {
    return wait("WAIT — CVD conflict");
  }

  const wall = direction === "LONG" ? bid : ask;
  if (!wall) return wait("WAIT — wall not confirmed");

  if (input.spoofChecked && !input.spoofCleared) {
    return wait("WAIT — wall not confirmed");
  }

  const whale = wall.whale;
  const flowSupport =
    direction === "LONG"
      ? confirmed.outflow >= WHALE_BTC
      : confirmed.inflow >= WHALE_BTC;
  const strength: SignalStrength = whale && flowSupport ? "high" : "medium";

  const reasons = [
    direction === "LONG" ? "buying CVD" : "selling CVD",
    direction === "LONG" ? "taker buy pressure" : "taker sell pressure",
    "open interest rising with price",
    direction === "LONG" ? "price above VWAP/support" : "price below VWAP/resistance",
    `${wall.side} wall ${wall.btc.toFixed(0)} BTC holding`,
    flowSupport
      ? direction === "LONG"
        ? "confirmed outflow supports accumulation"
        : "confirmed inflow supports distribution"
      : "confirmed flow does not oppose",
    "fresh spot + futures",
  ];

  const plan = buildPrecisionPlan({
    direction,
    live: input.live,
    vwap: input.vwap,
    bars: input.bars,
    walls: [...input.bidWalls, ...input.askWalls],
    wall,
    reason: reasons.join("; "),
    strength,
    settings,
    nowMs: now,
  });
  if (!plan) {
    return wait("WAIT — poor risk/reward", { confirmations: reasons });
  }
  const drift = Math.abs(input.live - plan.entry) / plan.entry;
  if (drift > settings.maxEntryDriftPct / 100) {
    return wait("WAIT — too far from entry", { confirmations: reasons });
  }

  return {
    direction,
    waitReason: "",
    strength,
    plan,
    dataStale: false,
    confirmations: reasons,
  };
}
