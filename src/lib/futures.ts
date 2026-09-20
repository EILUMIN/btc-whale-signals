import { fetchJson } from "@/lib/http";
import { isStale } from "@/lib/format";
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
  basisPct: number | null;
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
type OkxTicker = { last?: string; volCcy24h?: string };
type OkxOi = { oi?: string; oiCcy?: string };
type OkxFund = { fundingRate?: string };
type OkxLiq = { bkPx?: string; sz?: string; side?: string; instId?: string };

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
    "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP",
  ]);
  const oi = await tryJson<OkxBox<OkxOi>>([
    "https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP",
  ]);
  const fund = await tryJson<OkxBox<OkxFund>>([
    "https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP",
  ]);
  const liq = await tryJson<OkxBox<OkxLiq>>([
    "https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled&limit=50",
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
  return { ticker, oi, fund, liq, ratio, taker, bitgetTaker };
}

function n(v: unknown): number | null {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

export function emptyFutures(reason: string): FuturesSnapshot {
  const ts = isoNow();
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
    longLiquidations: null,
    shortLiquidations: null,
    basisPct: null,
    metrics: [],
    waitReason: reason,
  };
}

export async function fetchFuturesSnapshot(): Promise<FuturesSnapshot> {
  const staleLimit = loadRiskSettings().futuresStaleSec;
  const [binance, bybit, okx] = await Promise.all([
    binanceCore(),
    bybitCore(),
    okxCore(),
  ]);
  const sources: string[] = [];
  const now = isoNow();

  const mark = n(binance.premium?.data.markPrice);
  const index = n(binance.premium?.data.indexPrice);
  const bybitLast = n(bybit.tickers?.data.result?.list?.[0]?.lastPrice);
  const okxLast = n(okx.ticker?.data.data?.[0]?.last);
  const futuresPrice = mark ?? bybitLast ?? okxLast;
  if (binance.premium) sources.push("binance-fapi");
  else if (bybit.tickers) sources.push("bybit");
  else if (okx.ticker) sources.push("okx");

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
  const oiPrev =
    n(binance.oiHist?.data.at(-2)?.sumOpenInterest) ??
    n(bybit.oi?.data.result?.list?.[1]?.openInterest);
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

  let longLiq: number | null = null;
  let shortLiq: number | null = null;
  if (binance.force?.data?.length) {
    longLiq = 0;
    shortLiq = 0;
    for (const row of binance.force.data) {
      const qty = n(row.origQty) ?? 0;
      const px = n(row.price) ?? 0;
      const usdVal = qty * px;
      // SELL force order = long liquidation
      if (String(row.side).toUpperCase() === "SELL") longLiq += usdVal;
      else shortLiq += usdVal;
    }
    sources.push("binance-force");
  } else if (okx.liq?.data.data?.length) {
    longLiq = 0;
    shortLiq = 0;
    for (const row of okx.liq.data.data) {
      const qty = n(row.sz) ?? 0;
      const px = n(row.bkPx) ?? 0;
      const usdVal = qty * px;
      if (String(row.side).toLowerCase() === "sell") longLiq += usdVal;
      else shortLiq += usdVal;
    }
    sources.push("okx-liq");
  }

  const basisPct =
    mark !== null && index !== null && index > 0 ? (mark - index) / index : null;
  const premiumTs = binance.premium?.data.time
    ? new Date(binance.premium.data.time).toISOString()
    : now;
  const lsTs = binance.ls?.data.at(-1)?.timestamp
    ? new Date(Number(binance.ls.data.at(-1)?.timestamp)).toISOString()
    : now;
  const takerTs = binance.taker?.data.at(-1)?.timestamp
    ? new Date(Number(binance.taker.data.at(-1)?.timestamp)).toISOString()
    : now;
  const oiTs = binance.oiHist?.data.at(-1)?.timestamp
    ? new Date(Number(binance.oiHist.data.at(-1)?.timestamp)).toISOString()
    : now;

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
    metric(
      "Long liquidations",
      longLiq,
      longLiq !== null ? usd(longLiq) : "—",
      longLiq !== null ? sources.find((s) => s.includes("liq") || s.includes("force")) ?? "none" : "none",
      now,
      staleLimit,
      "short"
    ),
    metric(
      "Short liquidations",
      shortLiq,
      shortLiq !== null ? usd(shortLiq) : "—",
      shortLiq !== null ? sources.find((s) => s.includes("liq") || s.includes("force")) ?? "none" : "none",
      now,
      staleLimit,
      "long"
    ),
    metric(
      "Basis / premium",
      basisPct,
      basisPct !== null ? pct(basisPct, 3) : "—",
      binance.premium ? "binance-fapi" : "none",
      premiumTs,
      staleLimit,
      basisPct !== null && basisPct > 0
        ? "long"
        : basisPct !== null && basisPct < 0
          ? "short"
          : "wait"
    ),
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
    longLiquidations: longLiq,
    shortLiquidations: shortLiq,
    basisPct,
    metrics,
    waitReason,
  };
}
