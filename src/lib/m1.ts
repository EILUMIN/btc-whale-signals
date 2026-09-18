import { roundPrice } from "@/lib/price";

export const M1_TF = "1m";
export const M1_LIMIT = 90;
export const WHALE_BTC = 500;
export const WALL_BTC = 500;
export const NOTABLE_WALL_BTC = 80;
export const WALL_BUCKET_USD = 25;
export const TOUCH_PCT = 0.0025;
export const SPOOF_DELAY_MS = 5_000;
export const SPOOF_KEEP_RATIO = 0.8;
export const WALLET_USD = 1_000;
export const RISK_USD = 10;
export const RR_MULT = 3;
export const BOOK_LIMIT = 500;
export const FLOW_WINDOW_SEC = 60 * 60;
/** PU Prime BTCUSD typically prints ~$130 below Binance/Coinbase. */
export const PU_PRIME_GAP_USD = 130;
/** Typical PU Prime BTCUSD spread to pad the MT4/MT5 stop. */
export const PU_PRIME_SPREAD_USD = 17;
/** 1.00 lot = 1 BTC on PU Prime BTCUSD. */
export const BTC_PER_LOT = 1;
export const LOT_STEP = 0.01;

export type WallSide = "bid" | "ask";

export type WhaleWall = {
  side: WallSide;
  price: number;
  priceLow: number;
  priceHigh: number;
  btc: number;
  venues: string[];
  whale: boolean;
};

export type M1Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
};

export type OnchainFlow = {
  inflows: number;
  outflows: number;
  netflow: number;
  prints: Array<{
    txid: string;
    btc: number;
    kind: "inflow" | "outflow" | "internal" | "unlabeled";
    when: string;
  }>;
};

export type RiskPlan = {
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  takeProfit: number;
  wallPrice: number;
  riskPerBtc: number;
  riskUsd: number;
  walletUsd: number;
  sizeBtc: number;
  sizeLots: number;
  notionalUsd: number;
  rr: number;
  book: "exchange" | "puprime";
  gapUsd: number;
  spreadUsd: number;
};

export type M1Signal = "BUY" | "SELL" | "WAIT";

export type M1Snapshot = {
  ok: boolean;
  error: string | null;
  timeframe: "1m";
  candleKey: number;
  live_price: number;
  live_vwap: number;
  cvd: number;
  cvdLabel: string;
  signal: M1Signal;
  recommendation: string;
  spoofChecked: boolean;
  spoofCleared: boolean;
  armedPlan: RiskPlan | null;
  puPrimePlan: RiskPlan | null;
  walls: WhaleWall[];
  askWalls: WhaleWall[];
  bidWalls: WhaleWall[];
  bars: M1Bar[];
  flow: OnchainFlow;
  venues: Array<{ name: string; symbol: string; last: number; ok: boolean }>;
  scannedAt: string;
  source: string;
  alertPing?: boolean;
  emailStatus?: "sent" | "skipped" | "failed" | "idle";
  emailDetail?: string;
};

export function candleKeyUnix(unixMs = Date.now()): number {
  return Math.floor(unixMs / 60_000);
}

export function clusterWalls(
  levels: Array<{ price: number; btc: number; venue: string }>,
  side: WallSide,
  bucketUsd = WALL_BUCKET_USD
): WhaleWall[] {
  const buckets = new Map<
    number,
    { btc: number; low: number; high: number; venues: Set<string> }
  >();
  for (const row of levels) {
    if (!(row.price >= bucketUsd) || !(row.btc > 0)) continue;
    const key = Math.round(row.price / bucketUsd) * bucketUsd;
    if (!(key >= bucketUsd)) continue;
    const cur = buckets.get(key) ?? {
      btc: 0,
      low: row.price,
      high: row.price,
      venues: new Set<string>(),
    };
    cur.btc += row.btc;
    cur.low = Math.min(cur.low, row.price);
    cur.high = Math.max(cur.high, row.price);
    cur.venues.add(row.venue);
    buckets.set(key, cur);
  }
  return [...buckets.entries()]
    .map(([price, cur]) => ({
      side,
      price: roundPrice(price),
      priceLow: roundPrice(cur.low),
      priceHigh: roundPrice(cur.high),
      btc: roundPrice(cur.btc),
      venues: [...cur.venues],
      whale: cur.btc >= WALL_BTC,
    }))
    .filter((wall) => wall.btc >= NOTABLE_WALL_BTC && wall.price >= bucketUsd)
    .sort((a, b) => b.btc - a.btc);
}

export function wallStillReal(
  before: WhaleWall | undefined,
  afterList: WhaleWall[],
  keep = SPOOF_KEEP_RATIO
): boolean {
  if (!before) return false;
  const match = afterList.find(
    (wall) =>
      wall.side === before.side &&
      Math.abs(wall.price - before.price) <= WALL_BUCKET_USD * 1.5
  );
  return Boolean(match && match.btc >= before.btc * keep && match.btc >= WALL_BTC * keep);
}

export function touchesAskWall(bar: M1Bar, live: number, wall: WhaleWall): boolean {
  const band = wall.price * TOUCH_PCT;
  return bar.high + band >= wall.priceLow && live <= wall.priceHigh + band;
}

export function leansBidWall(bar: M1Bar, live: number, wall: WhaleWall): boolean {
  const band = wall.price * TOUCH_PCT;
  return bar.low - band <= wall.priceHigh && live >= wall.priceLow - band;
}

export function decideM1Confluence(input: {
  flow: OnchainFlow;
  live: number;
  bar: M1Bar | null;
  askWalls: WhaleWall[];
  bidWalls: WhaleWall[];
  cvd: number;
}): {
  signal: M1Signal;
  recommendation: string;
  wall: WhaleWall | null;
} {
  const bar = input.bar;
  const whaleAsks = input.askWalls.filter((w) => w.whale);
  const whaleBids = input.bidWalls.filter((w) => w.whale);
  if (!bar) {
    return {
      signal: "WAIT",
      recommendation: "Waiting for the current M1 candle.",
      wall: null,
    };
  }

  const askHit = whaleAsks.find((w) => touchesAskWall(bar, input.live, w));
  const bidHit = whaleBids.find((w) => leansBidWall(bar, input.live, w));
  const inflow = input.flow.inflows >= WHALE_BTC;
  const outflow = input.flow.outflows >= WHALE_BTC;
  const sellDelta = input.cvd <= 0;
  const buyDelta = input.cvd >= 0;

  if (inflow && askHit && sellDelta) {
    return {
      signal: "SELL",
      recommendation:
        "M1 SELL: on-chain inflow >500 BTC into an exchange AND price tagged a >500 BTC ask wall AND CVD selling delta.",
      wall: askHit,
    };
  }
  if (outflow && bidHit && buyDelta) {
    return {
      signal: "BUY",
      recommendation:
        "M1 BUY: on-chain outflow >500 BTC off an exchange AND price leaned on a >500 BTC bid wall AND CVD buying delta.",
      wall: bidHit,
    };
  }

  const missing: string[] = [];
  if (!inflow && !outflow) missing.push("no >500 BTC labeled inflow/outflow this hour");
  if (!askHit && !bidHit) missing.push("price not touching a >500 BTC book wall");
  if (inflow && askHit && !sellDelta) missing.push("CVD not confirming sell");
  if (outflow && bidHit && !buyDelta) missing.push("CVD not confirming buy");
  return {
    signal: "WAIT",
    recommendation: `M1 confluence waiting: ${missing.join("; ") || "filters not aligned"}.`,
    wall: askHit ?? bidHit ?? whaleAsks[0] ?? whaleBids[0] ?? null,
  };
}

export function buildWallPlan(
  side: "BUY" | "SELL",
  vwap: number,
  wall: WhaleWall
): RiskPlan | null {
  if (!(vwap > 0)) return null;
  const entry = roundPrice(vwap);
  const buffer = roundPrice(Math.max(wall.price * 0.0002, 5));
  const stop =
    side === "SELL"
      ? roundPrice(wall.priceHigh + buffer)
      : roundPrice(wall.priceLow - buffer);
  const riskPerBtc = roundPrice(Math.abs(entry - stop));
  if (riskPerBtc < 1) return null;
  if (side === "SELL" && stop <= entry) return null;
  if (side === "BUY" && stop >= entry) return null;
  const sizeBtc = Math.round((RISK_USD / riskPerBtc) * 1_000_000) / 1_000_000;
  const takeProfit =
    side === "SELL"
      ? roundPrice(entry - RR_MULT * riskPerBtc)
      : roundPrice(entry + RR_MULT * riskPerBtc);
  return {
    side,
    entry,
    stop,
    takeProfit,
    wallPrice: wall.price,
    riskPerBtc,
    riskUsd: RISK_USD,
    walletUsd: WALLET_USD,
    sizeBtc,
    sizeLots: btcToLots(sizeBtc),
    notionalUsd: roundPrice(sizeBtc * entry),
    rr: RR_MULT,
    book: "exchange",
    gapUsd: 0,
    spreadUsd: 0,
  };
}

export function btcToLots(sizeBtc: number): number {
  if (!(sizeBtc > 0)) return 0;
  const lots = Math.round(sizeBtc / BTC_PER_LOT / LOT_STEP) * LOT_STEP;
  return Math.round(Math.max(lots, LOT_STEP) * 100) / 100;
}

export function lotsGuide(lots: number): string {
  return `Use ${lots.toFixed(2)} Lots`;
}

export function puPrimeQuote(exchangeUsd: number): number {
  return roundPrice(exchangeUsd - PU_PRIME_GAP_USD);
}

/**
 * MT4/MT5 guide: shift every level −$130 so PU Prime matches the exchange
 * screen, then pad the stop by the $17 spread and re-size to $10 max risk.
 */
export function toPuPrimePlan(plan: RiskPlan): RiskPlan | null {
  const entry = roundPrice(plan.entry - PU_PRIME_GAP_USD);
  const stop =
    plan.side === "BUY"
      ? roundPrice(plan.stop - PU_PRIME_GAP_USD - PU_PRIME_SPREAD_USD)
      : roundPrice(plan.stop - PU_PRIME_GAP_USD + PU_PRIME_SPREAD_USD);
  const riskPerBtc = roundPrice(Math.abs(entry - stop));
  if (riskPerBtc < 1) return null;
  if (plan.side === "SELL" && stop <= entry) return null;
  if (plan.side === "BUY" && stop >= entry) return null;
  const sizeBtc = Math.round((RISK_USD / riskPerBtc) * 1_000_000) / 1_000_000;
  const sizeLots = btcToLots(sizeBtc);
  const takeProfit =
    plan.side === "SELL"
      ? roundPrice(entry - RR_MULT * riskPerBtc)
      : roundPrice(entry + RR_MULT * riskPerBtc);
  return {
    side: plan.side,
    entry,
    stop,
    takeProfit,
    wallPrice: roundPrice(plan.wallPrice - PU_PRIME_GAP_USD),
    riskPerBtc,
    riskUsd: RISK_USD,
    walletUsd: WALLET_USD,
    sizeBtc,
    sizeLots,
    notionalUsd: roundPrice(sizeLots * BTC_PER_LOT * entry),
    rr: RR_MULT,
    book: "puprime",
    gapUsd: PU_PRIME_GAP_USD,
    spreadUsd: PU_PRIME_SPREAD_USD,
  };
}

export function cvdFromBars(bars: M1Bar[]): number {
  return bars.reduce((sum, bar) => sum + (bar.buyVolume - bar.sellVolume), 0);
}
