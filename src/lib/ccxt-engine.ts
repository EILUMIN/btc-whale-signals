import ccxt from "ccxt";
import {
  ATR_LEN,
  BOOK_LIMIT,
  NEAR_PCT,
  OHLCV_LIMIT,
  OHLCV_TF,
  RSI_LEN,
  SELL_WALL_RATIO,
  buildRiskPlan,
  decideMatrixSignal,
  type MatrixSnapshot,
  type VenueQuote,
  wilderAtr,
  wilderRsi,
} from "@/lib/matrix";
import { roundPrice } from "@/lib/price";

type ExchangeId = "binance" | "binanceus" | "coinbaseexchange" | "coinbase" | "kraken";

type Route = { id: ExchangeId; symbol: string; label: string };

const ROUTES: Route[] = [
  { id: "binance", symbol: "BTC/USDT", label: "binance" },
  { id: "coinbaseexchange", symbol: "BTC/USD", label: "coinbase" },
  { id: "kraken", symbol: "BTC/USD", label: "kraken" },
];

const FALLBACKS: Partial<Record<ExchangeId, Route>> = {
  binance: { id: "binanceus", symbol: "BTC/USD", label: "binanceus" },
  coinbaseexchange: { id: "coinbase", symbol: "BTC/USD", label: "coinbase" },
};

function makeExchange(id: ExchangeId) {
  const factories = ccxt as unknown as Record<
    string,
    new (opts: Record<string, unknown>) => {
      fetchTicker: (symbol: string) => Promise<{ last?: number; close?: number }>;
      fetchOrderBook: (
        symbol: string,
        limit?: number
      ) => Promise<{ bids?: unknown[]; asks?: unknown[] }>;
      fetchOHLCV: (
        symbol: string,
        timeframe?: string,
        since?: number,
        limit?: number
      ) => Promise<number[][]>;
    }
  >;
  const Klass = factories[id];
  if (!Klass) throw new Error(`Unknown exchange ${id}`);
  return new Klass({
    enableRateLimit: true,
    timeout: 12_000,
    options: { defaultType: "spot" },
  });
}

function levels(side: unknown[] | undefined): Array<[number, number]> {
  const rows: Array<[number, number]> = [];
  for (const item of side ?? []) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const price = Number(item[0]);
    const amount = Number(item[1]);
    if (Number.isFinite(price) && Number.isFinite(amount)) {
      rows.push([price, amount]);
    }
  }
  return rows;
}

async function pullBook(route: Route): Promise<VenueQuote> {
  try {
    const ex = makeExchange(route.id);
    const [ticker, book] = await Promise.all([
      ex.fetchTicker(route.symbol),
      ex.fetchOrderBook(route.symbol, BOOK_LIMIT),
    ]);
    const last = Number(ticker.last ?? ticker.close ?? 0);
    const bids = levels(book.bids);
    const asks = levels(book.asks);
    const bid = bids[0]?.[0] ?? last;
    const ask = asks[0]?.[0] ?? last;
    const mid = bid && ask ? (bid + ask) / 2 : last;
    const ref = mid || last;
    const lo = ref * (1 - NEAR_PCT);
    const hi = ref * (1 + NEAR_PCT);
    return {
      name: route.label,
      symbol: route.symbol,
      bid,
      ask,
      last: last || mid,
      bidsNear: bids.filter(([p]) => p >= lo).reduce((s, [, q]) => s + q, 0),
      asksNear: asks.filter(([p]) => p <= hi).reduce((s, [, q]) => s + q, 0),
      ok: true,
      error: null,
    };
  } catch (error) {
    return {
      name: route.label,
      symbol: route.symbol,
      bid: 0,
      ask: 0,
      last: 0,
      bidsNear: 0,
      asksNear: 0,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 160) : String(error),
    };
  }
}

async function pullWithFallback(route: Route): Promise<VenueQuote> {
  const primary = await pullBook(route);
  if (primary.ok) return primary;
  const fallback = FALLBACKS[route.id];
  if (!fallback) return primary;
  return pullBook(fallback);
}

async function pullOhlcv(route: Route): Promise<number[][]> {
  try {
    const ex = makeExchange(route.id);
    return await ex.fetchOHLCV(route.symbol, OHLCV_TF, undefined, OHLCV_LIMIT);
  } catch {
    const fallback = FALLBACKS[route.id];
    if (!fallback) return [];
    try {
      const ex = makeExchange(fallback.id);
      return await ex.fetchOHLCV(
        fallback.symbol,
        OHLCV_TF,
        undefined,
        OHLCV_LIMIT
      );
    } catch {
      return [];
    }
  }
}

type Cache = { at: number; snap: MatrixSnapshot };
const g = globalThis as unknown as { __matrixCache?: Cache };

export async function getMatrixSnapshot(): Promise<MatrixSnapshot> {
  const now = Date.now();
  if (g.__matrixCache && now - g.__matrixCache.at < 6_000) {
    return g.__matrixCache.snap;
  }

  const [venues, ohlcvSets] = await Promise.all([
    Promise.all(ROUTES.map(pullWithFallback)),
    Promise.all(ROUTES.map(pullOhlcv)),
  ]);

  const goods = venues.filter((v) => v.ok && v.last > 0);
  const livePrice =
    goods.length > 0
      ? goods.reduce((s, v) => s + v.last, 0) / goods.length
      : 0;
  const bidsNear = goods.reduce((s, v) => s + v.bidsNear, 0);
  const asksNear = goods.reduce((s, v) => s + v.asksNear, 0);

  const series = new Map<number, Array<[number, number, number, number]>>();
  for (const candles of ohlcvSets) {
    for (const row of candles) {
      const ts = Number(row[0]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const vol = Number(row[5] ?? 0);
      if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
      const bucket = series.get(ts) ?? [];
      bucket.push([high, low, close, vol]);
      series.set(ts, bucket);
    }
  }

  const stamps = [...series.keys()].sort((a, b) => a - b);
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const typical: number[] = [];
  const vols: number[] = [];
  for (const ts of stamps) {
    const rows = series.get(ts) ?? [];
    const high = rows.reduce((s, r) => s + r[0], 0) / rows.length;
    const low = rows.reduce((s, r) => s + r[1], 0) / rows.length;
    const close = rows.reduce((s, r) => s + r[2], 0) / rows.length;
    const vol = rows.reduce((s, r) => s + r[3], 0);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    vols.push(vol);
    typical.push(((high + low + close) / 3) * vol);
  }
  const volSum = vols.reduce((s, v) => s + v, 0) || 1e-9;
  const vwap = typical.reduce((s, v) => s + v, 0) / volSum;
  const rsis = wilderRsi(closes, RSI_LEN);
  const atrs = wilderAtr(highs, lows, closes, ATR_LEN);
  const live_rsi = rsis.at(-1) ?? 0;
  const rsi_prev = rsis.at(-2) ?? live_rsi;
  const live_atr = atrs.at(-1) ?? 0;
  const live_vwap = vwap > 0 ? vwap : livePrice;

  const decision = decideMatrixSignal({
    rsi: live_rsi,
    rsiPrev: rsi_prev,
    atr: live_atr,
  });
  const sellPlan = buildRiskPlan("SELL", live_vwap, live_atr);
  const buyPlan = buildRiskPlan("BUY", live_vwap, live_atr);
  const armedPlan =
    decision.signal === "SELL"
      ? sellPlan
      : decision.signal === "BUY"
        ? buyPlan
        : null;

  const errors = venues.filter((v) => !v.ok).map((v) => `${v.name}: ${v.error}`);
  const snap: MatrixSnapshot = {
    ok: goods.length > 0 && live_rsi > 0,
    error: goods.length === 0 ? errors.join("; ") || "No public books" : null,
    live_rsi: roundPrice(live_rsi),
    live_atr: roundPrice(live_atr),
    live_vwap: roundPrice(live_vwap),
    live_price: roundPrice(livePrice || live_vwap),
    rsi_prev: roundPrice(rsi_prev),
    breakoutLock: decision.breakoutLock,
    lockText: decision.lockText,
    exhaustionDrop: decision.exhaustionDrop,
    recoverFromOversold: decision.recoverFromOversold,
    signal: decision.signal,
    recommendation: decision.recommendation,
    sellPlan,
    buyPlan,
    armedPlan,
    venues,
    bidsNear,
    asksNear,
    heavySell: asksNear >= SELL_WALL_RATIO * Math.max(bidsNear, 1e-9),
    heavyBuy: bidsNear >= SELL_WALL_RATIO * Math.max(asksNear, 1e-9),
    bars: closes.length,
    scannedAt: new Date().toISOString(),
    source: goods.map((v) => v.name).join(" + ") || "none",
  };

  g.__matrixCache = { at: now, snap };
  return snap;
}
