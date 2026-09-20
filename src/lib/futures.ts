import {
  BINANCE_USDT_PERP,
  OKX_FUTURES_INSTRUMENT,
  OKX_INDEX_INSTRUMENT,
  OKX_SPOT_INSTRUMENT,
  computeBasis,
  emptyBasisResult,
  formatBasisDisplay,
  type BasisQuote,
  type BasisResult,
  type BasisStatus,
} from "@/lib/basis";
import { fetchJson, HttpError } from "@/lib/http";
import { isStale } from "@/lib/format";
import {
  OKX_LIQ_SOURCE,
  emptyLiquidations,
  parseBinanceForceOrders,
  parseOkxLiquidations,
  type LiquidationResult,
  type OkxLiquidationPayload,
} from "@/lib/liquidations";
import { loadRiskSettings } from "@/lib/risk-settings";

export type MetricTone = "long" | "short" | "wait" | "stale";

export type FuturesMetric = {
  label: string;
  value: number | null;
  display: string;
  source: string;
  timestamp: string | null;
  stale: boolean;
  missing: boolean;
  tone: MetricTone;
  optional?: boolean;
  reason?: string | null;
  status?: BasisStatus;
  eventCount?: number | null;
  detail?: string | null;
};

export type FuturesSnapshot = {
  ok: boolean;
  stale: boolean;
  missingCore: boolean;
  conflict: boolean;
  source: string;
  timestamp: string | null;
  futuresPrice: number | null;
  volume: number | null;
  openInterest: number | null;
  openInterestPrev: number | null;
  oiRising: boolean | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  takerBuy: number | null;
  takerSell: number | null;
  takerBuyDominant: boolean | null;
  longLiquidations: number | null;
  shortLiquidations: number | null;
  liqAvailable: boolean;
  liqStatus: BasisStatus;
  liqReason: string | null;
  liqSource: string | null;
  liqTimestamp: string | null;
  liqStale: boolean;
  liqEventCount: number | null;
  liqLongCount: number | null;
  liqShortCount: number | null;
  liqHttpStatus: number | null;
  basis: number | null;
  basisPct: number | null;
  basisSource: string | null;
  basisReason: string | null;
  basisTimestamp: string | null;
  basisStale: boolean;
  basisAvailable: boolean;
  basisStatus: BasisStatus;
  spotIndexPrice: number | null;
  futuresInstrument: string | null;
  spotInstrument: string | null;
  metrics: FuturesMetric[];
  waitReason: string | null;
};

const BINANCE_FAPI = [
  "https://fapi.binance.com",
  "https://fapi.binance.us",
];

async function tryJson<T>(urls: string[]): Promise<{ data: T; url: string } | null> {
  for (const url of urls) {
    try {
      const data = await fetchJson<T>(url, {}, 8_000);
      return { data, url };
    } catch {
      // next public host
    }
  }
  return null;
}

function isoNow() {
  return new Date().toISOString();
}

function metric(
  label: string,
  value: number | null,
  display: string,
  source: string,
  timestamp: string | null,
  staleLimit: number,
  tone: MetricTone
): FuturesMetric {
  const missing = value === null || !Number.isFinite(value);
  const stale = missing || isStale(timestamp, staleLimit);
  return {
    label,
    value: missing ? null : value,
    display: missing ? "unavailable" : display,
    source,
    timestamp,
    stale,
    missing,
    tone: missing || stale ? "stale" : tone,
  };
}

function pct(n: number, digits = 4) {
  return `${(n * 100).toFixed(digits)}%`;
}

function usd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

type BinancePremium = {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  lastFundingRate?: string;
  time?: number;
};
type BinanceOi = { openInterest?: string };
type BinanceTicker = { lastPrice?: string; volume?: string; quoteVolume?: string };
type BinanceRatio = Array<{
  longShortRatio?: string;
  buySellRatio?: string;
  buyVol?: string;
  sellVol?: string;
  sumOpenInterest?: string;
  timestamp?: number;
}>;
type BybitTicker = {
  result?: {
    list?: Array<{
      lastPrice?: string;
      turnover24h?: string;
      volume24h?: string;
      openInterest?: string;
      fundingRate?: string;
      markPrice?: string;
      indexPrice?: string;
    }>;
  };
};
type BybitOi = {
  result?: { list?: Array<{ openInterest?: string; timestamp?: string | number }> };
};
type OkxBox<T> = { data?: T[] };
type OkxTicker = { instId?: string; last?: string; volCcy24h?: string; ts?: string };
type OkxIndex = { instId?: string; idxPx?: string; ts?: string };
type OkxMark = { instId?: string; markPx?: string; ts?: string };
type OkxOi = { oi?: string; oiCcy?: string; ts?: string };
type OkxFund = { fundingRate?: string };

async function binanceCore() {
  const premium = await tryJson<BinancePremium>(
    BINANCE_FAPI.map((h) => `${h}/fapi/v1/premiumIndex?symbol=BTCUSDT`)
  );
  const oi = await tryJson<BinanceOi>(
    BINANCE_FAPI.map((h) => `${h}/fapi/v1/openInterest?symbol=BTCUSDT`)
  );
  const ticker = await tryJson<BinanceTicker>(
    BINANCE_FAPI.map((h) => `${h}/fapi/v1/ticker/24hr?symbol=BTCUSDT`)
  );
  const ls = await tryJson<BinanceRatio>(
    BINANCE_FAPI.map(
      (h) =>
        `${h}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=2`
    )
  );
  const taker = await tryJson<BinanceRatio>(
    BINANCE_FAPI.map(
      (h) =>
        `${h}/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=5m&limit=2`
    )
  );
  const oiHist = await tryJson<BinanceRatio>(
    BINANCE_FAPI.map(
      (h) =>
        `${h}/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=2`
    )
  );
  const force = await tryJson<Array<{ side?: string; price?: string; origQty?: string }>>(
    BINANCE_FAPI.map((h) => `${h}/fapi/v1/allForceOrders?symbol=BTCUSDT&limit=50`)
  );
  return { premium, oi, ticker, ls, taker, oiHist, force };
}

async function bybitCore() {
  const tickers = await tryJson<BybitTicker>([
    "https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT",
  ]);
  const oi = await tryJson<BybitOi>([
    "https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=2",
  ]);
  return { tickers, oi };
}

async function okxCore() {
  const ticker = await tryJson<OkxBox<OkxTicker>>([
    `https://www.okx.com/api/v5/market/ticker?instId=${OKX_FUTURES_INSTRUMENT}`,
  ]);
  const spot = await tryJson<OkxBox<OkxTicker>>([
    `https://www.okx.com/api/v5/market/ticker?instId=${OKX_SPOT_INSTRUMENT}`,
  ]);
  const index = await tryJson<OkxBox<OkxIndex>>([
    `https://www.okx.com/api/v5/market/index-tickers?instId=${OKX_INDEX_INSTRUMENT}`,
  ]);
  const mark = await tryJson<OkxBox<OkxMark>>([
    `https://www.okx.com/api/v5/public/mark-price?instId=${OKX_FUTURES_INSTRUMENT}`,
  ]);
  const oi = await tryJson<OkxBox<OkxOi>>([
    `https://www.okx.com/api/v5/public/open-interest?instId=${OKX_FUTURES_INSTRUMENT}`,
  ]);
  const fund = await tryJson<OkxBox<OkxFund>>([
    `https://www.okx.com/api/v5/public/funding-rate?instId=${OKX_FUTURES_INSTRUMENT}`,
  ]);
  const ratio = await tryJson<OkxBox<[string, string]>>([
    "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=5m",
  ]);
  const taker = await tryJson<OkxBox<[string, string, string]>>([
    "https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=5m",
  ]);
  const bitgetTaker = await tryJson<{
    data?: Array<{ buyVolume?: string; sellVolume?: string }>;
  }>([
    "https://api.bitget.com/api/v2/mix/market/taker-buy-sell?symbol=BTCUSDT&period=5m",
  ]);
  return { ticker, spot, index, mark, oi, fund, ratio, taker, bitgetTaker };
}

async function fetchOkxLiquidationResult(
  staleLimit: number,
  nowMs: number
): Promise<LiquidationResult> {
  const url =
    "https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled&limit=50";
  const fetchedAt = new Date(nowMs).toISOString();
  try {
    const payload = await fetchJson<OkxLiquidationPayload>(url, {}, 8_000);
    return parseOkxLiquidations(payload, {
      fetchedAt,
      nowMs,
      staleLimitSec: staleLimit,
      httpStatus: 200,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status ?? null : null;
    const message = error instanceof Error ? error.message : "request failed";
    if (status) {
      return emptyLiquidations(`API error ${status}: ${message}`, {
        httpStatus: status,
        source: OKX_LIQ_SOURCE,
      });
    }
    return emptyLiquidations(`request failed: ${message}`, {
      source: OKX_LIQ_SOURCE,
    });
  }
}

function n(v: unknown): number | null {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

function okxIso(ts?: string | number | null): string | null {
  if (ts === null || ts === undefined || ts === "") return null;
  const x = Number(ts);
  if (!Number.isFinite(x) || x <= 0) return null;
  return new Date(x).toISOString();
}

function quote(
  venue: string,
  instrument: string,
  price: number | null,
  timestamp: string | null,
  kind: BasisQuote["kind"]
): BasisQuote | null {
  if (price === null && !timestamp) return null;
  return { venue, instrument, price, timestamp, kind };
}

function basisFields(result: BasisResult) {
  return {
    basis: result.basis,
    basisPct: result.basisPct,
    basisSource: result.source,
    basisReason: result.reason,
    basisTimestamp: result.timestamp,
    basisStale: result.stale,
    basisAvailable: result.available,
    basisStatus: result.status,
    spotIndexPrice: result.spotIndexPrice,
    futuresInstrument: result.futuresInstrument,
    spotInstrument: result.spotInstrument,
  };
}

function liqFields(result: LiquidationResult) {
  return {
    longLiquidations: result.longUsd,
    shortLiquidations: result.shortUsd,
    liqAvailable: result.available,
    liqStatus: result.status,
    liqReason: result.reason,
    liqSource: result.source,
    liqTimestamp: result.timestamp,
    liqStale: result.stale,
    liqEventCount: result.eventCount,
    liqLongCount: result.longCount,
    liqShortCount: result.shortCount,
    liqHttpStatus: result.httpStatus,
  };
}

function liqMetric(
  label: "Long liquidations" | "Short liquidations",
  result: LiquidationResult
): FuturesMetric {
  const value =
    label === "Long liquidations" ? result.longUsd : result.shortUsd;
  const display =
    label === "Long liquidations" ? result.displayLong : result.displayShort;
  return {
    label,
    value: result.available && !result.stale ? value : null,
    display,
    source: result.source ?? "none",
    timestamp: result.timestamp,
    stale: result.stale,
    missing: !result.available,
    optional: true,
    reason: result.reason,
    tone: result.stale || !result.available
      ? result.stale
        ? "stale"
        : "wait"
      : label === "Long liquidations"
        ? "short"
        : "long",
    status: result.status,
    eventCount:
      label === "Long liquidations" ? result.longCount : result.shortCount,
    detail: result.detail,
  };
}

function basisMetric(result: BasisResult): FuturesMetric {
  if (!result.available || result.basis === null || result.basisPct === null) {
    return {
      label: "Basis / premium",
      value: null,
      display: `UNAVAILABLE — ${result.reason ?? "source missing"}`,
      source: result.source ?? "none",
      timestamp: result.timestamp,
      stale: false,
      missing: true,
      optional: true,
      reason: result.reason,
      tone: "wait",
      status: "unavailable",
    };
  }
  return {
    label: "Basis / premium",
    value: result.basisPct,
    display: formatBasisDisplay(result.basis, result.basisPct),
    source: result.source ?? "none",
    timestamp: result.timestamp,
    stale: result.stale,
    missing: false,
    optional: true,
    reason: null,
    tone: result.basis > 0 ? "long" : result.basis < 0 ? "short" : "wait",
    status: result.status,
  };
}

export function emptyFutures(reason: string): FuturesSnapshot {
  const ts = isoNow();
  const unavailable = emptyBasisResult("source missing");
  return {
    ok: false,
    stale: true,
    missingCore: true,
    conflict: false,
    source: "none",
    timestamp: ts,
    futuresPrice: null,
    volume: null,
    openInterest: null,
    openInterestPrev: null,
    oiRising: null,
    fundingRate: null,
    longShortRatio: null,
    takerBuy: null,
    takerSell: null,
    takerBuyDominant: null,
    ...liqFields(emptyLiquidations("source missing")),
    ...basisFields(unavailable),
    metrics: [],
    waitReason: reason,
  };
}

export async function fetchFuturesSnapshot(): Promise<FuturesSnapshot> {
  const staleLimit = loadRiskSettings().futuresStaleSec;
  const [binance, bybit, okx, okxLiq] = await Promise.all([
    binanceCore(),
    bybitCore(),
    okxCore(),
    fetchOkxLiquidationResult(staleLimit, Date.now()),
  ]);
  const sources: string[] = [];
  const now = isoNow();
  const nowMs = Date.now();

  const binanceMark = n(binance.premium?.data.markPrice);
  const binanceIndex = n(binance.premium?.data.indexPrice);
  const bybitLast = n(bybit.tickers?.data.result?.list?.[0]?.lastPrice);
  const okxSwap = okx.ticker?.data.data?.[0];
  const okxIndexRow = okx.index?.data.data?.[0];
  const okxSpotRow = okx.spot?.data.data?.[0];
  const okxMarkRow = okx.mark?.data.data?.[0];
  const okxLast = n(okxSwap?.last);
  const okxMarkPx = n(okxMarkRow?.markPx);
  const okxFuturesPx = okxLast ?? okxMarkPx;
  // Same-venue first: do not mix OKX futures with Binance index, or the reverse.
  const futuresPrice = okxFuturesPx ?? binanceMark ?? bybitLast;
  if (okx.ticker || okx.mark) sources.push("okx");
  else if (binance.premium) sources.push("binance-fapi");
  else if (bybit.tickers) sources.push("bybit");

  const funding =
    n(binance.premium?.data.lastFundingRate) ??
    n(bybit.tickers?.data.result?.list?.[0]?.fundingRate) ??
    n(okx.fund?.data.data?.[0]?.fundingRate);

  const oiNow =
    n(binance.oi?.data.openInterest) ??
    n(binance.oiHist?.data.at(-1)?.sumOpenInterest) ??
    n(bybit.tickers?.data.result?.list?.[0]?.openInterest) ??
    n(bybit.oi?.data.result?.list?.[0]?.openInterest) ??
    n(okx.oi?.data.data?.[0]?.oiCcy);
  let oiPrev =
    n(binance.oiHist?.data.at(-1) && binance.oiHist.data.length > 1
      ? binance.oiHist.data.at(-2)?.sumOpenInterest
      : undefined) ??
    n(bybit.oi?.data.result?.list?.[1]?.openInterest);
  const oiMem = globalThis as unknown as {
    __btcOiPrev?: { at: number; oi: number };
  };
  if (oiNow !== null) {
    if (
      oiPrev === null &&
      oiMem.__btcOiPrev &&
      Date.now() - oiMem.__btcOiPrev.at < 30 * 60_000
    ) {
      oiPrev = oiMem.__btcOiPrev.oi;
    }
    oiMem.__btcOiPrev = { at: Date.now(), oi: oiNow };
  }
  const oiRising =
    oiNow !== null && oiPrev !== null ? oiNow > oiPrev : null;

  const volume =
    n(binance.ticker?.data.quoteVolume) ??
    n(bybit.tickers?.data.result?.list?.[0]?.turnover24h) ??
    n(okx.ticker?.data.data?.[0]?.volCcy24h);

  const ls =
    n(binance.ls?.data.at(-1)?.longShortRatio) ??
    n(okx.ratio?.data.data?.[0]?.[1]);
  const takerBuy =
    n(binance.taker?.data.at(-1)?.buyVol) ??
    n(okx.taker?.data.data?.[0]?.[2]) ??
    n(okx.bitgetTaker?.data.data?.at(-1)?.buyVolume);
  const takerSell =
    n(binance.taker?.data.at(-1)?.sellVol) ??
    n(okx.taker?.data.data?.[0]?.[1]) ??
    n(okx.bitgetTaker?.data.data?.at(-1)?.sellVolume);
  const takerRatio = n(binance.taker?.data.at(-1)?.buySellRatio);
  const takerBuyDominant =
    takerBuy !== null && takerSell !== null
      ? takerBuy > takerSell
      : takerRatio !== null
        ? takerRatio > 1
        : null;
  if (okx.ticker) sources.push("okx");
  if (okx.taker) sources.push("okx-taker");
  if (okx.bitgetTaker) sources.push("bitget");

  // Optional confirmation only. Never invent $0 when the payload is missing.
  let liqResult = okxLiq;
  if (!liqResult.available && binance.force?.data) {
    const binanceLiq = parseBinanceForceOrders(binance.force.data, {
      fetchedAt: now,
      nowMs,
      staleLimitSec: staleLimit,
    });
    if (binanceLiq.available) liqResult = binanceLiq;
  }
  if (liqResult.source) sources.push(liqResult.source.split(" · ")[0]);

  const okxFuturesQuote = quote(
    "okx",
    okxSwap?.instId ?? okxMarkRow?.instId ?? OKX_FUTURES_INSTRUMENT,
    okxFuturesPx,
    okxIso(okxSwap?.ts) ?? okxIso(okxMarkRow?.ts),
    "futures"
  );
  const okxIndexQuote = quote(
    "okx",
    okxIndexRow?.instId ?? OKX_INDEX_INSTRUMENT,
    n(okxIndexRow?.idxPx),
    okxIso(okxIndexRow?.ts),
    "index"
  );
  const okxSpotQuote = quote(
    "okx",
    okxSpotRow?.instId ?? OKX_SPOT_INSTRUMENT,
    n(okxSpotRow?.last),
    okxIso(okxSpotRow?.ts),
    "spot"
  );
  let basisResult = computeBasis({
    futures: okxFuturesQuote,
    index: okxIndexQuote,
    spot: okxSpotQuote,
    nowMs,
    staleLimitSec: staleLimit,
  });
  const binancePremiumTs = binance.premium?.data.time
    ? new Date(binance.premium.data.time).toISOString()
    : null;
  if (!basisResult.available) {
    const binancePair = computeBasis({
      futures: quote(
        "binance",
        BINANCE_USDT_PERP,
        binanceMark,
        binancePremiumTs,
        "futures"
      ),
      index: quote(
        "binance",
        BINANCE_USDT_PERP,
        binanceIndex,
        binancePremiumTs,
        "index"
      ),
      nowMs,
      staleLimitSec: staleLimit,
    });
    if (binancePair.available) basisResult = binancePair;
  }
  if (basisResult.available && basisResult.source) {
    sources.push(basisResult.source.startsWith("okx") ? "okx-basis" : "binance-basis");
  }

  const okxPriceTs = okxIso(okxSwap?.ts) ?? okxIso(okxMarkRow?.ts);
  const premiumTs = okxPriceTs ?? binancePremiumTs ?? now;
  const lsTs = binance.ls?.data.at(-1)?.timestamp
    ? new Date(Number(binance.ls.data.at(-1)?.timestamp)).toISOString()
    : now;
  const takerTs = binance.taker?.data.at(-1)?.timestamp
    ? new Date(Number(binance.taker.data.at(-1)?.timestamp)).toISOString()
    : now;
  const oiTs = binance.oiHist?.data.at(-1)?.timestamp
    ? new Date(Number(binance.oiHist.data.at(-1)?.timestamp)).toISOString()
    : okxIso(okx.oi?.data.data?.[0]?.ts) ?? now;

  // Mandatory signal data: futures price, OI, funding, taker flow, freshness.
  // Basis/premium is optional confirmation and never sets missingCore.
  const missingCore =
    futuresPrice === null ||
    oiNow === null ||
    funding === null ||
    takerBuyDominant === null;
  const staleCore =
    isStale(premiumTs, staleLimit) ||
    isStale(oiTs, staleLimit) ||
    isStale(takerTs, staleLimit);

  const metrics: FuturesMetric[] = [
    metric(
      "Futures price",
      futuresPrice,
      futuresPrice !== null ? usd(futuresPrice) : "—",
      sources[0] ?? "none",
      premiumTs,
      staleLimit,
      "wait"
    ),
    metric(
      "Futures volume",
      volume,
      volume !== null ? usd(volume) : "—",
      sources[0] ?? "none",
      premiumTs,
      staleLimit,
      "wait"
    ),
    metric(
      "Open interest",
      oiNow,
      oiNow !== null
        ? `${oiNow.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC`
        : "—",
      sources[0] ?? "none",
      oiTs,
      staleLimit,
      oiRising === true ? "long" : oiRising === false ? "short" : "wait"
    ),
    metric(
      "Funding rate",
      funding,
      funding !== null ? pct(funding) : "—",
      sources[0] ?? "none",
      premiumTs,
      staleLimit,
      funding !== null && funding > 0
        ? "long"
        : funding !== null && funding < 0
          ? "short"
          : "wait"
    ),
    metric(
      "Long/short ratio",
      ls,
      ls !== null ? ls.toFixed(3) : "—",
      binance.ls ? "binance-fapi" : okx.ratio ? "okx" : "none",
      lsTs,
      staleLimit,
      ls !== null && ls > 1 ? "long" : ls !== null && ls < 1 ? "short" : "wait"
    ),
    metric(
      "Taker buy volume",
      takerBuy,
      takerBuy !== null ? takerBuy.toFixed(2) : "—",
      binance.taker ? "binance-fapi" : okx.taker ? "okx" : okx.bitgetTaker ? "bitget" : "none",
      takerTs,
      staleLimit,
      takerBuyDominant === true ? "long" : "wait"
    ),
    metric(
      "Taker sell volume",
      takerSell,
      takerSell !== null ? takerSell.toFixed(2) : "—",
      binance.taker ? "binance-fapi" : okx.taker ? "okx" : okx.bitgetTaker ? "bitget" : "none",
      takerTs,
      staleLimit,
      takerBuyDominant === false ? "short" : "wait"
    ),
    liqMetric("Long liquidations", liqResult),
    liqMetric("Short liquidations", liqResult),
    basisMetric(basisResult),
  ];

  let waitReason: string | null = null;
  if (missingCore) {
    waitReason = "WAIT — DATA STALE";
  } else if (staleCore) {
    waitReason = "WAIT — DATA STALE";
  }

  return {
    ok: !missingCore && !staleCore,
    stale: staleCore || missingCore,
    missingCore,
    conflict: false,
    source: [...new Set(sources)].join(" + ") || "none",
    timestamp: premiumTs,
    futuresPrice,
    volume,
    openInterest: oiNow,
    openInterestPrev: oiPrev,
    oiRising,
    fundingRate: funding,
    longShortRatio: ls,
    takerBuy,
    takerSell,
    takerBuyDominant,
    ...liqFields(liqResult),
    ...basisFields(basisResult),
    metrics,
    waitReason,
  };
}
