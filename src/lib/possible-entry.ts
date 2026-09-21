import { isStale } from "@/lib/format";
import { roundPrice } from "@/lib/price";

export type TfBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartTrend = "bullish" | "bearish" | "neutral";
export type PossibleStatus = "POSSIBLE LONG" | "POSSIBLE SHORT" | "WAIT";
export type WhaleConfirmLabel = "CONFIRMED" | "NOT CONFIRMED" | "UNAVAILABLE";

export const POSSIBLE_ENTRY_TF = "M15 trend · M5 confirm · M1 timing";
export const EXTENDED_REASON = "Move extended—waiting for pullback/retest.";
export const RSI_OVERBOUGHT = 78;
export const RSI_OVERSOLD = 22;
export const EXTENDED_PCT = 0.0055;
export const WEAK_VOLUME_RATIO = 0.55;
export const M1_CLOSED_STALE_SEC = 120;
export const M5_CLOSED_STALE_SEC = 6 * 60;
export const M15_CLOSED_STALE_SEC = 16 * 60;

export type PossibleEntrySignal = {
  status: PossibleStatus;
  direction: "LONG" | "SHORT" | "WAIT";
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  timeframe: string;
  trend: ChartTrend;
  confidence: number;
  reason: string;
  timestamp: string;
  dataFresh: boolean;
  dataAgeSec: number | null;
  whaleConfirmation: WhaleConfirmLabel;
  source: string;
  closedCandle: boolean;
};

export function emptyPossibleEntry(
  reason: string,
  extra: Partial<PossibleEntrySignal> = {}
): PossibleEntrySignal {
  return {
    status: "WAIT",
    direction: "WAIT",
    entryLow: null,
    entryHigh: null,
    stop: null,
    tp1: null,
    tp2: null,
    rr: null,
    timeframe: POSSIBLE_ENTRY_TF,
    trend: extra.trend ?? "neutral",
    confidence: 0,
    reason,
    timestamp: extra.timestamp ?? new Date().toISOString(),
    dataFresh: extra.dataFresh ?? false,
    dataAgeSec: extra.dataAgeSec ?? null,
    whaleConfirmation: extra.whaleConfirmation ?? "UNAVAILABLE",
    source: extra.source ?? "none",
    closedCandle: extra.closedCandle ?? false,
  };
}

export function ema(values: number[], period: number): number[] {
  if (period < 1 || values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((sum, n) => sum + n, 0) / period;
  for (let i = 0; i < period - 1; i += 1) out.push(Number.NaN);
  out.push(prev);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function atr(bars: TfBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = bars[i - 1].close;
    const bar = bars[i];
    trs.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev))
    );
  }
  const slice = trs.slice(-period);
  return slice.reduce((sum, n) => sum + n, 0) / slice.length;
}

export function closedBars(
  bars: TfBar[],
  intervalMs: number,
  nowMs: number
): TfBar[] {
  return bars.filter(
    (bar) =>
      Number.isFinite(bar.time) &&
      bar.time > 0 &&
      bar.close > 0 &&
      bar.time + intervalMs <= nowMs
  );
}

export function detectTrend(bars: TfBar[]): ChartTrend {
  const closes = bars.map((bar) => bar.close);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const ema21 = e21.at(-1);
  const ema50 = e50.at(-1);
  const ema21Prev = e21.at(-4);
  const last = bars.at(-1);
  const prior = bars.at(-6);
  if (
    !last ||
    ema21 === undefined ||
    ema50 === undefined ||
    !Number.isFinite(ema21) ||
    !Number.isFinite(ema50)
  ) {
    return "neutral";
  }
  const emaRising = ema21Prev === undefined || !Number.isFinite(ema21Prev) ? true : ema21 >= ema21Prev;
  const emaFalling = ema21Prev === undefined || !Number.isFinite(ema21Prev) ? true : ema21 <= ema21Prev;
  const priceUp = !prior || last.close >= prior.close;
  const priceDown = !prior || last.close <= prior.close;
  if (ema21 > ema50 && last.close > ema21 && emaRising && priceUp) return "bullish";
  if (ema21 < ema50 && last.close < ema21 && emaFalling && priceDown) return "bearish";
  return "neutral";
}

export function m5Momentum(bars: TfBar[]): ChartTrend {
  const closes = bars.map((bar) => bar.close);
  const e21 = ema(closes, 21);
  const ema21 = e21.at(-1);
  const emaPrev = e21.at(-4);
  const last = bars.at(-1);
  if (!last || ema21 === undefined || !Number.isFinite(ema21)) return "neutral";
  const rising = emaPrev === undefined || !Number.isFinite(emaPrev) || ema21 >= emaPrev;
  const falling = emaPrev === undefined || !Number.isFinite(emaPrev) || ema21 <= emaPrev;
  if (last.close > ema21 && rising) return "bullish";
  if (last.close < ema21 && falling) return "bearish";
  return "neutral";
}

export function volumeHealthy(bars: TfBar[]): boolean {
  if (bars.length < 8) return false;
  const last = bars.at(-1);
  if (!last) return false;
  const look = bars.slice(-21, -1);
  if (!look.length) return last.volume > 0;
  const avg = look.reduce((sum, bar) => sum + bar.volume, 0) / look.length;
  if (!(avg > 0)) return last.volume > 0;
  return last.volume >= avg * WEAK_VOLUME_RATIO;
}

export function bullishM1(bar: TfBar, prev: TfBar | undefined): boolean {
  const body = Math.abs(bar.close - bar.open);
  const lower = Math.min(bar.open, bar.close) - bar.low;
  const upper = bar.high - Math.max(bar.open, bar.close);
  const range = bar.high - bar.low;
  const rejection = range > 0 && lower >= body * 1.8 && bar.close >= bar.open && upper <= lower * 0.7;
  const confirm = bar.close > bar.open && (!prev || bar.close > prev.high);
  const engulf =
    Boolean(prev) &&
    prev!.close < prev!.open &&
    bar.close > bar.open &&
    bar.close >= prev!.open &&
    bar.open <= prev!.close;
  return rejection || confirm || engulf;
}

export function bearishM1(bar: TfBar, prev: TfBar | undefined): boolean {
  const body = Math.abs(bar.close - bar.open);
  const lower = Math.min(bar.open, bar.close) - bar.low;
  const upper = bar.high - Math.max(bar.open, bar.close);
  const range = bar.high - bar.low;
  const rejection = range > 0 && upper >= body * 1.8 && bar.close <= bar.open && lower <= upper * 0.7;
  const confirm = bar.close < bar.open && (!prev || bar.close < prev.low);
  const engulf =
    Boolean(prev) &&
    prev!.close > prev!.open &&
    bar.close < bar.open &&
    bar.close <= prev!.open &&
    bar.open >= prev!.close;
  return rejection || confirm || engulf;
}

export function recentResistance(bars: TfBar[]): number {
  const slice = bars.slice(-16, -1);
  if (!slice.length) return bars.at(-1)?.high ?? 0;
  return Math.max(...slice.map((bar) => bar.high));
}

export function recentSupport(bars: TfBar[]): number {
  const slice = bars.slice(-16, -1);
  if (!slice.length) return bars.at(-1)?.low ?? 0;
  return Math.min(...slice.map((bar) => bar.low));
}

export function lastEma(bars: TfBar[], period: number): number | null {
  const series = ema(
    bars.map((bar) => bar.close),
    period
  );
  const value = series.at(-1);
  return value !== undefined && Number.isFinite(value) ? value : null;
}

export function isExtended(close: number, zone: number): boolean {
  if (!(close > 0) || !(zone > 0)) return true;
  return Math.abs(close - zone) / zone > EXTENDED_PCT;
}

export function whaleConfirmationLabel(input: {
  whaleSignal?: "BUY" | "SELL" | "WAIT" | "WATCH" | null;
  esploraSource?: string | null;
}): WhaleConfirmLabel {
  const source = input.esploraSource?.trim() ?? "";
  if (!source || source === "none") return "UNAVAILABLE";
  if (input.whaleSignal === "BUY" || input.whaleSignal === "SELL") return "CONFIRMED";
  return "NOT CONFIRMED";
}

function alignedWhale(
  label: WhaleConfirmLabel,
  whaleSignal: "BUY" | "SELL" | "WAIT" | "WATCH" | null | undefined,
  side: "LONG" | "SHORT"
): WhaleConfirmLabel {
  if (label === "UNAVAILABLE") return "UNAVAILABLE";
  if (side === "LONG" && whaleSignal === "BUY") return "CONFIRMED";
  if (side === "SHORT" && whaleSignal === "SELL") return "CONFIRMED";
  return "NOT CONFIRMED";
}

function wait(
  reason: string,
  extra: Partial<PossibleEntrySignal> = {}
): PossibleEntrySignal {
  return emptyPossibleEntry(reason, extra);
}

function plan(
  side: "LONG" | "SHORT",
  close: number,
  zone: number,
  bars: TfBar[],
  reason: string,
  confidence: number,
  extra: Partial<PossibleEntrySignal>
): PossibleEntrySignal {
  const vol = atr(bars);
  const buffer = roundPrice(Math.max(vol * 0.35, close * 0.0008, 8));
  let stop: number;
  let entryLow: number;
  let entryHigh: number;
  if (side === "LONG") {
    stop = roundPrice(Math.min(zone, bars.at(-1)?.low ?? zone) - buffer);
    entryLow = roundPrice(Math.min(zone, close));
    entryHigh = roundPrice(Math.max(zone, close));
    if (stop >= entryLow) stop = roundPrice(entryLow - buffer);
  } else {
    stop = roundPrice(Math.max(zone, bars.at(-1)?.high ?? zone) + buffer);
    entryLow = roundPrice(Math.min(zone, close));
    entryHigh = roundPrice(Math.max(zone, close));
    if (stop <= entryHigh) stop = roundPrice(entryHigh + buffer);
  }
  const entry = roundPrice((entryLow + entryHigh) / 2);
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return wait("WAIT — invalid stop/entry zone", extra);
  const tp1 = roundPrice(side === "LONG" ? entry + 1.5 * risk : entry - 1.5 * risk);
  const tp2 = roundPrice(side === "LONG" ? entry + 2.5 * risk : entry - 2.5 * risk);
  const rr = roundPrice(Math.abs(tp1 - entry) / risk);
  return {
    status: side === "LONG" ? "POSSIBLE LONG" : "POSSIBLE SHORT",
    direction: side,
    entryLow,
    entryHigh,
    stop,
    tp1,
    tp2,
    rr,
    timeframe: POSSIBLE_ENTRY_TF,
    trend: extra.trend ?? (side === "LONG" ? "bullish" : "bearish"),
    confidence: Math.max(1, Math.min(90, Math.round(confidence))),
    reason,
    timestamp: extra.timestamp ?? new Date().toISOString(),
    dataFresh: extra.dataFresh ?? true,
    dataAgeSec: extra.dataAgeSec ?? 0,
    whaleConfirmation: extra.whaleConfirmation ?? "NOT CONFIRMED",
    source: extra.source ?? "public btcusd candles",
    closedCandle: true,
  };
}

export function decidePossibleEntry(input: {
  m15: TfBar[];
  m5: TfBar[];
  m1: TfBar[];
  nowMs?: number;
  source?: string;
  whaleSignal?: "BUY" | "SELL" | "WAIT" | "WATCH" | null;
  esploraSource?: string | null;
  m15Closed?: boolean;
  m5Closed?: boolean;
  m1Closed?: boolean;
}): PossibleEntrySignal {
  const nowMs = input.nowMs ?? Date.now();
  const timestamp = new Date(nowMs).toISOString();
  const whaleBase = whaleConfirmationLabel({
    whaleSignal: input.whaleSignal,
    esploraSource: input.esploraSource,
  });
  const waitWhale: WhaleConfirmLabel =
    whaleBase === "UNAVAILABLE" ? "UNAVAILABLE" : "NOT CONFIRMED";
  const base: Partial<PossibleEntrySignal> = {
    timestamp,
    source: input.source ?? "public btcusd candles",
    whaleConfirmation: waitWhale,
  };

  if (!input.m15Closed || !input.m5Closed || !input.m1Closed) {
    return wait("WAIT — waiting for candle close", {
      ...base,
      closedCandle: false,
      dataFresh: false,
    });
  }
  if (input.m15.length < 55 || input.m5.length < 30 || input.m1.length < 8) {
    return wait("WAIT — required chart data unavailable", {
      ...base,
      closedCandle: true,
    });
  }

  const m15Last = input.m15.at(-1)!;
  const m5Last = input.m5.at(-1)!;
  const m1Last = input.m1.at(-1)!;
  const m1Prev = input.m1.at(-2);
  const ageSec = Math.max(
    0,
    Math.round((nowMs - (m1Last.time + 60_000)) / 1000)
  );
  const fresh =
    !isStale(new Date(m1Last.time + 60_000).toISOString(), M1_CLOSED_STALE_SEC, nowMs) &&
    !isStale(new Date(m5Last.time + 5 * 60_000).toISOString(), M5_CLOSED_STALE_SEC, nowMs) &&
    !isStale(
      new Date(m15Last.time + 15 * 60_000).toISOString(),
      M15_CLOSED_STALE_SEC,
      nowMs
    );
  if (!fresh) {
    return wait("WAIT — chart data stale", {
      ...base,
      dataFresh: false,
      dataAgeSec: ageSec,
      closedCandle: true,
    });
  }

  const trend = detectTrend(input.m15);
  const m5Trend = m5Momentum(input.m5);
  const rsi5 = rsi(input.m5.map((bar) => bar.close), 14);
  const ema21 = lastEma(input.m5, 21);
  const extra = {
    ...base,
    trend,
    dataFresh: true,
    dataAgeSec: ageSec,
    closedCandle: true,
  };

  if (trend === "neutral") {
    return wait("WAIT — M15 trend is neutral", extra);
  }
  if (trend === "bullish" && m5Trend === "bearish") {
    return wait("WAIT — contradictory M15/M5 signals", extra);
  }
  if (trend === "bearish" && m5Trend === "bullish") {
    return wait("WAIT — contradictory M15/M5 signals", extra);
  }
  if (m5Trend === "neutral") {
    return wait("WAIT — M5 did not confirm momentum", extra);
  }
  if (!volumeHealthy(input.m5)) {
    return wait("WAIT — volume abnormally weak", extra);
  }
  if (rsi5 === null) {
    return wait("WAIT — required chart data unavailable", extra);
  }

  const resistance = recentResistance(input.m5);
  const support = recentSupport(input.m5);
  const prevM5 = input.m5.at(-2);

  if (trend === "bullish" && m5Trend === "bullish") {
    if (!bullishM1(m1Last, m1Prev)) {
      return wait("WAIT — M1 has no bullish rejection/confirmation close", extra);
    }
    const breakout =
      Boolean(prevM5) &&
      prevM5!.close <= resistance &&
      m5Last.close > resistance;
    const pullback =
      ema21 !== null &&
      m5Last.low <= ema21 * 1.0015 &&
      m5Last.close >= Math.min(ema21, support) &&
      m5Last.close >= m5Last.open;
    if (!breakout && !pullback) {
      return wait("WAIT — no M5 breakout close or support/EMA retest", extra);
    }
    const zone = breakout ? resistance : (ema21 ?? support);
    if (isExtended(m5Last.close, zone)) {
      return wait(EXTENDED_REASON, extra);
    }
    if (rsi5 >= RSI_OVERBOUGHT) {
      return wait("WAIT — RSI extremely overbought", extra);
    }
    const whale = alignedWhale(whaleBase, input.whaleSignal, "LONG");
    const setup = breakout
      ? "M15 bullish; M5 closed above recent resistance; M1 bullish confirmation"
      : "M15 bullish; M5 pullback/retest of support/EMA; M1 bullish rejection";
    return plan("LONG", m5Last.close, zone, input.m5, setup, 62 + (whale === "CONFIRMED" ? 8 : 0) + (breakout ? 6 : 4), {
      ...extra,
      whaleConfirmation: whale,
    });
  }

  if (trend === "bearish" && m5Trend === "bearish") {
    if (!bearishM1(m1Last, m1Prev)) {
      return wait("WAIT — M1 has no bearish rejection/confirmation close", extra);
    }
    const breakdown =
      Boolean(prevM5) &&
      prevM5!.close >= support &&
      m5Last.close < support;
    const retest =
      ema21 !== null &&
      m5Last.high >= ema21 * 0.9985 &&
      m5Last.close <= Math.max(ema21, resistance) &&
      m5Last.close <= m5Last.open;
    if (!breakdown && !retest) {
      return wait("WAIT — no M5 breakdown close or resistance/EMA retest", extra);
    }
    const zone = breakdown ? support : (ema21 ?? resistance);
    if (isExtended(m5Last.close, zone)) {
      return wait(EXTENDED_REASON, extra);
    }
    if (rsi5 <= RSI_OVERSOLD) {
      return wait("WAIT — RSI extremely oversold", extra);
    }
    const whale = alignedWhale(whaleBase, input.whaleSignal, "SHORT");
    const setup = breakdown
      ? "M15 bearish; M5 closed below recent support; M1 bearish confirmation"
      : "M15 bearish; M5 retest of resistance/EMA; M1 bearish rejection";
    return plan("SHORT", m5Last.close, zone, input.m5, setup, 62 + (whale === "CONFIRMED" ? 8 : 0) + (breakdown ? 6 : 4), {
      ...extra,
      whaleConfirmation: whale,
    });
  }

  return wait("WAIT — incomplete chart confirmation", extra);
}
