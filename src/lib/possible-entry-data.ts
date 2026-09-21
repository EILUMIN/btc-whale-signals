import { fetchJson } from "@/lib/http";
import {
  closedBars,
  type TfBar,
} from "@/lib/possible-entry";

const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api.binance.us",
];

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  ...unknown[]
];

type OkxCandle = {
  data?: Array<string[]>;
};

const INTERVAL_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
} as const;

const OKX_BAR = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
} as const;

function toBar(time: number, o: number, h: number, l: number, c: number, v: number): TfBar | null {
  if (![time, o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) return null;
  return {
    time,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: Number.isFinite(v) && v > 0 ? v : 0,
  };
}

async function binanceKlines(
  interval: keyof typeof INTERVAL_MS,
  limit: number
): Promise<{ bars: TfBar[]; source: string } | null> {
  const path = `/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`;
  for (const host of BINANCE_HOSTS) {
    try {
      const rows = await fetchJson<BinanceKline[]>(`${host}${path}`, {}, 8_000);
      const bars = rows
        .map((row) =>
          toBar(
            Number(row[0]),
            Number(row[1]),
            Number(row[2]),
            Number(row[3]),
            Number(row[4]),
            Number(row[5])
          )
        )
        .filter((bar): bar is TfBar => Boolean(bar));
      if (bars.length < 8) continue;
      const source = host.includes("binance.us") ? "Binance.US" : "Binance";
      return { bars, source: `${source} ${interval}` };
    } catch {
      // next public host
    }
  }
  return null;
}

async function okxKlines(
  interval: keyof typeof INTERVAL_MS,
  limit: number
): Promise<{ bars: TfBar[]; source: string } | null> {
  try {
    const body = await fetchJson<OkxCandle>(
      `https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=${OKX_BAR[interval]}&limit=${limit}`,
      {},
      8_000
    );
    const rows = [...(body.data ?? [])].reverse();
    const bars = rows
      .map((row) =>
        toBar(
          Number(row[0]),
          Number(row[1]),
          Number(row[2]),
          Number(row[3]),
          Number(row[4]),
          Number(row[5])
        )
      )
      .filter((bar): bar is TfBar => Boolean(bar));
    if (bars.length < 8) return null;
    return { bars, source: `OKX ${interval}` };
  } catch {
    return null;
  }
}

export async function fetchTfBars(
  interval: keyof typeof INTERVAL_MS,
  limit: number,
  nowMs = Date.now()
): Promise<{ bars: TfBar[]; source: string; closed: boolean }> {
  const pack = (await binanceKlines(interval, limit)) ?? (await okxKlines(interval, limit));
  if (!pack) return { bars: [], source: "none", closed: false };
  const closed = closedBars(pack.bars, INTERVAL_MS[interval], nowMs);
  return {
    bars: closed,
    source: pack.source,
    closed: closed.length > 0,
  };
}

export type PossibleEntryBars = {
  m15: TfBar[];
  m5: TfBar[];
  m1: TfBar[];
  source: string;
  m15Closed: boolean;
  m5Closed: boolean;
  m1Closed: boolean;
};

const g = globalThis as unknown as { __possibleEntryBars?: { at: number; pack: PossibleEntryBars } };

export async function fetchPossibleEntryBars(nowMs = Date.now()): Promise<PossibleEntryBars> {
  if (g.__possibleEntryBars && nowMs - g.__possibleEntryBars.at < 20_000) {
    return g.__possibleEntryBars.pack;
  }
  const [m15, m5, m1] = await Promise.all([
    fetchTfBars("15m", 80, nowMs),
    fetchTfBars("5m", 80, nowMs),
    fetchTfBars("1m", 90, nowMs),
  ]);
  const sources = [m15.source, m5.source, m1.source].filter((s) => s !== "none");
  const pack: PossibleEntryBars = {
    m15: m15.bars,
    m5: m5.bars,
    m1: m1.bars,
    source: sources.join(" + ") || "none",
    m15Closed: m15.closed && m15.bars.length > 0,
    m5Closed: m5.closed && m5.bars.length > 0,
    m1Closed: m1.closed && m1.bars.length > 0,
  };
  g.__possibleEntryBars = { at: nowMs, pack };
  return pack;
}
