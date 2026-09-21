import ccxt from "ccxt";
import {
  BOOK_LIMIT,
  M1_LIMIT,
  M1_TF,
  SPOOF_DELAY_MS,
  candleKeyUnix,
  clusterWalls,
  cvdFromBars,
  decideM1Confluence,
  emptyOnchainFlow,
  toPuPrimePlan,
  wallStillReal,
  type M1Bar,
  type M1Snapshot,
  type WhaleWall,
} from "@/lib/m1";
import { scanOnchainFlow } from "@/lib/onchain-flow";
import { fetchJson, sleep, withRetry } from "@/lib/http";
import { roundPrice } from "@/lib/price";
import { emptyFutures, fetchFuturesSnapshot } from "@/lib/futures";
import { decidePrecisionSetup } from "@/lib/precision";
import { markToMarket, recordPrecisionDecision } from "@/lib/paper";
import { loadRiskSettings } from "@/lib/risk-settings";
import { WallStatusBook } from "@/lib/wall-status";

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

type VenueBook = {
  name: string;
  symbol: string;
  last: number;
  ok: boolean;
  error: string | null;
  bids: Array<{ price: number; btc: number; venue: string }>;
  asks: Array<{ price: number; btc: number; venue: string }>;
};

type ExchangeClient = {
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
};

function makeExchange(id: ExchangeId): ExchangeClient {
  const factories = ccxt as unknown as Record<
    string,
    new (opts: Record<string, unknown>) => ExchangeClient
  >;
  const Klass = factories[id];
  if (!Klass) throw new Error(`Unknown exchange ${id}`);
  return new Klass({
    enableRateLimit: true,
    timeout: 12_000,
    options: { defaultType: "spot" },
  });
}

function levels(
  side: unknown[] | undefined,
  venue: string
): Array<{ price: number; btc: number; venue: string }> {
  const rows: Array<{ price: number; btc: number; venue: string }> = [];
  for (const item of side ?? []) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const price = Number(item[0]);
    const amount = Number(item[1]);
    if (Number.isFinite(price) && Number.isFinite(amount) && amount > 0) {
      rows.push({ price, btc: amount, venue });
    }
  }
  return rows;
}

async function pullBook(route: Route): Promise<VenueBook> {
  try {
    const ex = makeExchange(route.id);
    const [ticker, book] = await Promise.all([
      ex.fetchTicker(route.symbol),
      ex.fetchOrderBook(route.symbol, BOOK_LIMIT),
    ]);
    const last = Number(ticker.last ?? ticker.close ?? 0);
    return {
      name: route.label,
      symbol: route.symbol,
      last,
      ok: true,
      error: null,
      bids: levels(book.bids, route.label),
      asks: levels(book.asks, route.label),
    };
  } catch (error) {
    return {
      name: route.label,
      symbol: route.symbol,
      last: 0,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 160) : String(error),
      bids: [],
      asks: [],
    };
  }
}

async function pullWithFallback(route: Route): Promise<VenueBook> {
  const primary = await pullBook(route);
  if (primary.ok) return primary;
  const fallback = FALLBACKS[route.id];
  if (!fallback) return primary;
  const second = await pullBook(fallback);
  return { ...second, name: route.label };
}

async function pullOhlcv(route: Route): Promise<number[][]> {
  try {
    const ex = makeExchange(route.id);
    return await ex.fetchOHLCV(route.symbol, M1_TF, undefined, M1_LIMIT);
  } catch {
    const fallback = FALLBACKS[route.id];
    if (!fallback) return [];
    try {
      const ex = makeExchange(fallback.id);
      return await ex.fetchOHLCV(fallback.symbol, M1_TF, undefined, M1_LIMIT);
    } catch {
      return [];
    }
  }
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

const BINANCE_KLINE_HOSTS = [
  "https://api.binance.com",
  "https://api.binance.us",
];

async function fetchBinanceDeltaBars(): Promise<Map<number, { buy: number; sell: number }>> {
  const path = `/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${M1_LIMIT}`;
  for (const host of BINANCE_KLINE_HOSTS) {
    try {
      const rows = await withRetry(
        () => fetchJson<BinanceKline[]>(`${host}${path}`),
        2,
        250
      );
      const map = new Map<number, { buy: number; sell: number }>();
      for (const row of rows) {
        const ts = Number(row[0]);
        const volume = Number(row[5] ?? 0);
        const buy = Number(row[9] ?? 0);
        if (!Number.isFinite(ts) || !Number.isFinite(volume)) continue;
        const buyVol = Number.isFinite(buy) ? buy : volume / 2;
        map.set(ts, { buy: buyVol, sell: Math.max(volume - buyVol, 0) });
      }
      return map;
    } catch {
      // try next host (Canada often needs Binance.US)
    }
  }
  return new Map();
}

function mergeBars(
  ohlcvSets: number[][][],
  delta: Map<number, { buy: number; sell: number }>
): M1Bar[] {
  const series = new Map<
    number,
    Array<{ open: number; high: number; low: number; close: number; volume: number }>
  >();
  for (const candles of ohlcvSets) {
    for (const row of candles) {
      const ts = Number(row[0]);
      const open = Number(row[1]);
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5] ?? 0);
      if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
      const bucket = series.get(ts) ?? [];
      bucket.push({ open, high, low, close, volume });
      series.set(ts, bucket);
    }
  }
  const stamps = [...series.keys()].sort((a, b) => a - b);
  return stamps.map((ts) => {
    const rows = series.get(ts) ?? [];
    const n = rows.length || 1;
    const open = rows.reduce((s, r) => s + r.open, 0) / n;
    const high = rows.reduce((s, r) => s + r.high, 0) / n;
    const low = rows.reduce((s, r) => s + r.low, 0) / n;
    const close = rows.reduce((s, r) => s + r.close, 0) / n;
    const volume = rows.reduce((s, r) => s + r.volume, 0);
    const d = delta.get(ts);
    let buyVolume = d?.buy ?? 0;
    let sellVolume = d?.sell ?? 0;
    if (!d) {
      if (close >= open) {
        buyVolume = volume * 0.6;
        sellVolume = volume * 0.4;
      } else {
        buyVolume = volume * 0.4;
        sellVolume = volume * 0.6;
      }
    }
    return {
      time: ts,
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume,
      buyVolume,
      sellVolume,
    };
  });
}

function sessionVwap(bars: M1Bar[]): number {
  let pv = 0;
  let vol = 0;
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    pv += typical * bar.volume;
    vol += bar.volume;
  }
  return vol > 0 ? pv / vol : 0;
}

function wallsFromBooks(books: VenueBook[]): {
  bidWalls: WhaleWall[];
  askWalls: WhaleWall[];
  walls: WhaleWall[];
} {
  const bids = books.flatMap((book) => book.bids);
  const asks = books.flatMap((book) => book.asks);
  const bidWalls = clusterWalls(bids, "bid");
  const askWalls = clusterWalls(asks, "ask");
  const walls = [...bidWalls, ...askWalls].sort((a, b) => b.btc - a.btc);
  return { bidWalls, askWalls, walls };
}

function cvdLabel(cvd: number): string {
  if (cvd > 0) return "buying delta";
  if (cvd < 0) return "selling delta";
  return "flat delta";
}

type Cache = { at: number; snap: M1Snapshot };
type FlowCache = { at: number; flow: ReturnType<typeof emptyOnchainFlow> };
type FutCache = { at: number; snap: Awaited<ReturnType<typeof fetchFuturesSnapshot>> };
const g = globalThis as unknown as {
  __m1Cache?: Cache;
  __m1FlowCache?: FlowCache;
  __m1FlowJob?: Promise<ReturnType<typeof emptyOnchainFlow>>;
  __m1FutCache?: FutCache;
  __wallStatus?: WallStatusBook;
};

function wallBook() {
  g.__wallStatus ??= new WallStatusBook();
  return g.__wallStatus;
}

const SNAP_CACHE_MS = 8_000;
const FLOW_CACHE_MS = 45_000;
const FLOW_WAIT_MS = 9_000;
const FUT_CACHE_MS = 20_000;

function withTimeout<T>(job: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    job.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      }
    );
  });
}

async function cachedOnchainFlow() {
  const now = Date.now();
  if (g.__m1FlowCache && now - g.__m1FlowCache.at < FLOW_CACHE_MS) {
    return { flow: g.__m1FlowCache.flow, fresh: true };
  }
  if (!g.__m1FlowJob) {
    g.__m1FlowJob = scanOnchainFlow()
      .then((flow) => {
        g.__m1FlowCache = { at: Date.now(), flow };
        return flow;
      })
      .finally(() => {
        g.__m1FlowJob = undefined;
      });
  }
  const waited = await withTimeout(g.__m1FlowJob, FLOW_WAIT_MS);
  if (waited) return { flow: waited, fresh: true };
  if (g.__m1FlowCache) {
    const age = Date.now() - g.__m1FlowCache.at;
    return { flow: g.__m1FlowCache.flow, fresh: age < FLOW_CACHE_MS };
  }
  return { flow: emptyOnchainFlow(), fresh: false };
}

async function cachedFutures() {
  const now = Date.now();
  if (g.__m1FutCache && now - g.__m1FutCache.at < FUT_CACHE_MS) {
    return g.__m1FutCache.snap;
  }
  try {
    const snap = await fetchFuturesSnapshot();
    g.__m1FutCache = { at: Date.now(), snap };
    return snap;
  } catch {
    return emptyFutures("WAIT — DATA STALE");
  }
}

export async function getM1Snapshot(options?: {
  skipSpoofDelay?: boolean;
}): Promise<M1Snapshot> {
  const now = Date.now();
  const { applyM1AlertLatch } = await import("@/lib/signal-alert");
  if (g.__m1Cache && now - g.__m1Cache.at < SNAP_CACHE_MS) {
    return applyM1AlertLatch(g.__m1Cache.snap);
  }

  const [venues, ohlcvSets, delta, flowPack, futures] = await Promise.all([
    Promise.all(ROUTES.map(pullWithFallback)),
    Promise.all(ROUTES.map(pullOhlcv)),
    fetchBinanceDeltaBars(),
    cachedOnchainFlow(),
    cachedFutures(),
  ]);
  const flow = flowPack.flow;

  const goods = venues.filter((v) => v.ok && v.last > 0);
  const livePrice =
    goods.length > 0
      ? goods.reduce((s, v) => s + v.last, 0) / goods.length
      : 0;

  const bars = mergeBars(ohlcvSets, delta);
  const live_vwap = sessionVwap(bars) || livePrice;
  const cvd = cvdFromBars(bars);
  const bar = bars.at(-1) ?? null;
  let { bidWalls, askWalls, walls } = wallsFromBooks(venues);

  let decision = decideM1Confluence({
    flow,
    live: livePrice || live_vwap,
    bar,
    askWalls,
    bidWalls,
    cvd,
  });

  let spoofChecked = false;
  let spoofCleared = false;

  if (
    (decision.signal === "BUY" || decision.signal === "SELL") &&
    decision.wall
  ) {
    spoofChecked = true;
    const before = decision.wall;
    if (!options?.skipSpoofDelay) {
      await sleep(SPOOF_DELAY_MS);
    }
    const again = await Promise.all(ROUTES.map(pullWithFallback));
    const clustered = wallsFromBooks(again);
    bidWalls = clustered.bidWalls;
    askWalls = clustered.askWalls;
    walls = clustered.walls;
    const still = wallStillReal(
      before,
      before.side === "ask" ? askWalls : bidWalls
    );
    spoofCleared = still;
    if (!still) {
      decision = {
        signal: "WAIT",
        recommendation:
          "Anti-spoof: the >500 BTC wall vanished or shrank inside 5 seconds. No M1 fire.",
        wall: before,
      };
    } else {
      decision = decideM1Confluence({
        flow,
        live: livePrice || live_vwap,
        bar,
        askWalls,
        bidWalls,
        cvd,
      });
    }
  }

  const statsBefore = markToMarket(livePrice || live_vwap);
  const openDir =
    statsBefore.open &&
    (statsBefore.open.direction === "LONG" ||
      statsBefore.open.direction === "SHORT")
      ? statsBefore.open.direction
      : null;
  const active = openDir
    ? {
        direction: openDir,
        expiryUnix:
          Date.parse(statsBefore.open!.at) +
          loadRiskSettings().signalExpirySec * 1000,
      }
    : null;
  const precisionInput = {
    live: livePrice || live_vwap,
    vwap: live_vwap,
    cvd,
    bars,
    bidWalls,
    askWalls,
    flow,
    futures,
    priceTimestamp: new Date().toISOString(),
    spoofChecked,
    spoofCleared,
    venuesOk: goods.length,
    active,
    tradesToday: statsBefore.tradesToday,
    dailyLossUsd: statsBefore.dailyLossUsd,
  };
  let finalPrecision = decidePrecisionSetup(precisionInput);

  if (
    (finalPrecision.direction === "LONG" ||
      finalPrecision.direction === "SHORT") &&
    !spoofChecked
  ) {
    spoofChecked = true;
    const wallForSpoof =
      finalPrecision.direction === "LONG"
        ? bidWalls.filter((w) => w.btc >= 80).sort((a, b) => b.btc - a.btc)[0]
        : askWalls.filter((w) => w.btc >= 80).sort((a, b) => b.btc - a.btc)[0];
    if (!options?.skipSpoofDelay) {
      await sleep(SPOOF_DELAY_MS);
    }
    const again = await Promise.all(ROUTES.map(pullWithFallback));
    const clustered = wallsFromBooks(again);
    bidWalls = clustered.bidWalls;
    askWalls = clustered.askWalls;
    walls = clustered.walls;
    spoofCleared = wallForSpoof
      ? wallStillReal(
          wallForSpoof,
          wallForSpoof.side === "ask" ? askWalls : bidWalls
        )
      : false;
    finalPrecision = decidePrecisionSetup({
      ...precisionInput,
      bidWalls,
      askWalls,
      spoofChecked,
      spoofCleared,
      priceTimestamp: new Date().toISOString(),
    });
  }

  const paper = recordPrecisionDecision({
    candleKey: candleKeyUnix(now),
    direction: finalPrecision.direction,
    waitReason: finalPrecision.waitReason,
    plan: finalPrecision.plan,
    live: livePrice || live_vwap,
  });

  const precisionArmed =
    finalPrecision.plan &&
    (finalPrecision.direction === "LONG" ||
      finalPrecision.direction === "SHORT")
      ? {
          side:
            finalPrecision.direction === "LONG"
              ? ("BUY" as const)
              : ("SELL" as const),
          entry: finalPrecision.plan.entry,
          stop: finalPrecision.plan.stop,
          takeProfit: finalPrecision.plan.tp2,
          wallPrice: finalPrecision.plan.entry,
          riskPerBtc: Math.abs(
            finalPrecision.plan.entry - finalPrecision.plan.stop
          ),
          riskUsd: finalPrecision.plan.riskUsd,
          walletUsd: 1_000,
          sizeBtc: finalPrecision.plan.sizeBtc,
          sizeLots: finalPrecision.plan.sizeLots,
          notionalUsd: finalPrecision.plan.notionalUsd,
          rr: finalPrecision.plan.rrTp2,
          book: "exchange" as const,
          gapUsd: 0,
          spreadUsd: 0,
        }
      : null;

  const errors = venues
    .filter((v) => !v.ok)
    .map((v) => `${v.name}: ${v.error}`);

  // Status badges only. HIT never feeds LONG/SHORT by itself.
  walls = wallBook().observe({
    walls: [...bidWalls, ...askWalls],
    live: livePrice || live_vwap,
    nowMs: Date.now(),
  });
  bidWalls = walls.filter((w) => w.side === "bid" && w.status !== "REMOVED");
  askWalls = walls.filter((w) => w.side === "ask" && w.status !== "REMOVED");

  const snap: M1Snapshot = {
    ok: goods.length > 0 && bars.length > 0,
    error: goods.length === 0 ? errors.join("; ") || "No public books" : null,
    timeframe: "1m",
    candleKey: candleKeyUnix(now),
    live_price: roundPrice(livePrice || live_vwap),
    live_vwap: roundPrice(live_vwap),
    cvd: roundPrice(cvd),
    cvdLabel: cvdLabel(cvd),
    signal: decision.signal,
    recommendation:
      finalPrecision.direction === "WAIT"
        ? finalPrecision.waitReason || decision.recommendation
        : finalPrecision.plan?.reason || decision.recommendation,
    spoofChecked,
    spoofCleared,
    armedPlan: precisionArmed,
    puPrimePlan: precisionArmed ? toPuPrimePlan(precisionArmed) : null,
    walls,
    askWalls,
    bidWalls,
    bars: bars.slice(-90),
    flow,
    venues: venues.map((v) => ({
      name: v.name,
      symbol: v.symbol,
      last: roundPrice(v.last),
      ok: v.ok,
    })),
    scannedAt: new Date().toISOString(),
    scanStatus: goods.length > 0 ? (flowPack.fresh ? "ok" : "scanning") : "failed",
    source: goods.map((v) => v.name).join(" + ") || "none",
    direction: finalPrecision.direction,
    waitReason: finalPrecision.waitReason,
    whaleSignal: decision.signal,
    signalStrength: finalPrecision.strength,
    dataStale: finalPrecision.dataStale,
    futures,
    tradePlan: finalPrecision.plan,
    paperTrading: loadRiskSettings().paperTrading,
    paperStats: paper,
  };

  g.__m1Cache = { at: Date.now(), snap };
  return applyM1AlertLatch(snap);
}

export function emptyM1Snapshot(error: string): M1Snapshot {
  return {
    ok: false,
    error,
    timeframe: "1m",
    candleKey: candleKeyUnix(),
    live_price: 0,
    live_vwap: 0,
    cvd: 0,
    cvdLabel: "flat delta",
    signal: "WAIT",
    recommendation: error,
    spoofChecked: false,
    spoofCleared: false,
    armedPlan: null,
    puPrimePlan: null,
    walls: [],
    askWalls: [],
    bidWalls: [],
    bars: [],
    flow: emptyOnchainFlow(),
    venues: [],
    scannedAt: new Date().toISOString(),
    scanStatus: "failed",
    source: "error",
    alertPing: false,
    emailStatus: "idle",
    emailDetail: "",
    discordStatus: "idle",
    discordDetail: "",
    direction: "WAIT",
    waitReason: error,
    whaleSignal: "WAIT",
    signalStrength: "blocked",
    dataStale: true,
    futures: emptyFutures(error),
    tradePlan: null,
    paperTrading: true,
    paperStats: null,
  };
}
