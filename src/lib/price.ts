import { fetchJson, withRetry } from "@/lib/http";
import type { LivePrice } from "@/lib/types";

type BinancePrice = { symbol: string; price: string };
type BinanceTicker = {
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
};
type Kline = [
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

const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api.binance.us",
];

async function tryHosts<T>(path: string): Promise<{ data: T; source: string }> {
  let lastError: unknown;
  for (const host of BINANCE_HOSTS) {
    try {
      const data = await withRetry(
        () => fetchJson<T>(`${host}${path}`),
        2,
        250
      );
      const source = host.includes("binance.us") ? "Binance.US" : "Binance";
      return { data, source };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Binance unavailable");
}

export async function fetchLivePrice(): Promise<LivePrice> {
  try {
    const { data, source } = await tryHosts<BinanceTicker>(
      "/api/v3/ticker/24hr?symbol=BTCUSDT"
    );
    return {
      usd: Number(data.lastPrice),
      change24hPct: Number(data.priceChangePercent),
      high24h: Number(data.highPrice),
      low24h: Number(data.lowPrice),
      source,
      timestamp: new Date().toISOString(),
    };
  } catch {
    try {
      const { data, source } = await tryHosts<BinancePrice>(
        "/api/v3/ticker/price?symbol=BTCUSDT"
      );
      return {
        usd: Number(data.price),
        change24hPct: null,
        high24h: null,
        low24h: null,
        source,
        timestamp: new Date().toISOString(),
      };
    } catch {
      const mempool = await withRetry(() =>
        fetchJson<{ USD: number; time: number }>(
          "https://mempool.space/api/v1/prices"
        )
      );
      return {
        usd: Number(mempool.USD),
        change24hPct: null,
        high24h: null,
        low24h: null,
        source: "Mempool.space",
        timestamp: new Date(mempool.time * 1000).toISOString(),
      };
    }
  }
}

export async function fetchPriceAtUnix(unixSeconds: number): Promise<{
  usd: number;
  source: string;
}> {
  const start = unixSeconds * 1000;
  try {
    const { data, source } = await tryHosts<Kline[]>(
      `/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${start}&limit=1`
    );
    const close = data?.[0]?.[4];
    if (close) {
      return { usd: Number(close), source: `${source} 1m kline` };
    }
  } catch {
    // fall through
  }

  try {
    const okx = await fetchJson<{
      data?: Array<[string, string, string, string, string]>;
    }>(
      `https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT&bar=1m&after=${start + 60_000}&limit=1`
    );
    const close = okx.data?.[0]?.[4];
    if (close) {
      return { usd: Number(close), source: "OKX 1m candle" };
    }
  } catch {
    // fall through
  }

  const live = await fetchLivePrice();
  return { usd: live.usd, source: `${live.source} (live fallback)` };
}

export type HourlyCandle = {
  high: number;
  low: number;
  close: number;
};

export async function fetchRecentHourlies(limit = 48): Promise<HourlyCandle[]> {
  try {
    const { data } = await tryHosts<Kline[]>(
      `/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=${limit}`
    );
    return data.map((row) => ({
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
    }));
  } catch {
    return [];
  }
}

export function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}
