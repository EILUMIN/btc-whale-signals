import { isStale } from "@/lib/format";
import {
  M1_CLOSED_STALE_SEC,
  M15_CLOSED_STALE_SEC,
  M5_CLOSED_STALE_SEC,
  bullishM1,
  bearishM1,
  isExtended,
  lastEma,
  m5Momentum,
  recentResistance,
  recentSupport,
  type ChartTrend,
  type PossibleStatus,
  type TfBar,
} from "@/lib/possible-entry";

export type H1Bias =
  | "bullish"
  | "bearish"
  | "neutral-bullish"
  | "neutral-bearish"
  | "neutral";
export type TfLean = ChartTrend;
export type OverallStatus = PossibleStatus;

export const OVERALL_BIAS_TF = "H1 direction · M15 structure · M5 confirm · M1 timing";
export const HTF_PULLBACK_WAIT =
  "WAIT — bullish higher-timeframe trend with bearish short-term pullback; confirmation missing.";
export const HTF_RALLY_WAIT =
  "WAIT — bearish higher-timeframe trend with bullish short-term rally; confirmation missing.";
export const H1_CLOSED_STALE_SEC = 80 * 60;

export type OverallAgreement = {
  h1: H1Bias;
  m15: TfLean;
  m5: TfLean;
  m1: TfLean;
  h1Rejected: boolean;
  m15Pullback: boolean;
  aligned: boolean;
  summary: string;
};

export type OverallMarketBias = {
  status: OverallStatus;
  direction: "LONG" | "SHORT" | "WAIT";
  reason: string;
  timeframe: string;
  agreement: OverallAgreement;
  confidence: number;
  timestamp: string;
  dataFresh: boolean;
  dataAgeSec: number | null;
  source: string;
  closedCandle: boolean;
};

const emptyAgreement: OverallAgreement = {
  h1: "neutral",
  m15: "neutral",
  m5: "neutral",
  m1: "neutral",
  h1Rejected: false,
  m15Pullback: false,
  aligned: false,
  summary: "H1 — · M15 — · M5 — · M1 —",
};

export function emptyOverallBias(
  reason: string,
  extra: Partial<OverallMarketBias> = {}
): OverallMarketBias {
  return {
    status: "WAIT",
    direction: "WAIT",
    reason,
    timeframe: OVERALL_BIAS_TF,
    agreement: extra.agreement ?? emptyAgreement,
    confidence: extra.confidence ?? 0,
    timestamp: extra.timestamp ?? new Date().toISOString(),
    dataFresh: extra.dataFresh ?? false,
    dataAgeSec: extra.dataAgeSec ?? null,
    source: extra.source ?? "none",
    closedCandle: extra.closedCandle ?? false,
  };
}

export function classifyH1(bars: TfBar[]): H1Bias {
  const ema21 = lastEma(bars, 21);
  const ema50 = lastEma(bars, 50);
  const last = bars.at(-1);
  if (!last || ema21 === null || ema50 === null) return "neutral";
  const prior = lastEma(bars.slice(0, -3), 21);
  const rising = prior === null || ema21 >= prior;
  const falling = prior === null || ema21 <= prior;
  if (ema21 > ema50) {
    if (last.close > ema21 && rising) return "bullish";
    return "neutral-bullish";
  }
  if (ema21 < ema50) {
    if (last.close < ema21 && falling) return "bearish";
    return "neutral-bearish";
  }
  return "neutral";
}

export function h1LongSide(bias: H1Bias): boolean {
  return bias === "bullish" || bias === "neutral-bullish";
}

export function h1ShortSide(bias: H1Bias): boolean {
  return bias === "bearish" || bias === "neutral-bearish";
}

/** Last closed H1 sold off the highs or printed a rejection wick. */
export function h1RejectedAgainstLong(bars: TfBar[]): boolean {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  if (!last) return false;
  const range = last.high - last.low;
  if (range > 0) {
    const body = Math.abs(last.close - last.open);
    const upper = last.high - Math.max(last.open, last.close);
    const closePos = (last.close - last.low) / range;
    if (last.close <= last.open && closePos <= 0.4) return true;
    if (last.close <= last.open && upper >= body * 1.4) return true;
  }
  if (
    prev &&
    prev.high >= last.high &&
    last.close < prev.close &&
    last.close < last.open
  ) {
    return true;
  }
  return false;
}

/** Last closed H1 bounced the lows or printed a bullish reversal wick. */
export function h1BullishReversal(bars: TfBar[]): boolean {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  if (!last) return false;
  const range = last.high - last.low;
  if (range > 0) {
    const body = Math.abs(last.close - last.open);
    const lower = Math.min(last.open, last.close) - last.low;
    const closePos = (last.close - last.low) / range;
    if (last.close >= last.open && closePos >= 0.6) return true;
    if (last.close >= last.open && lower >= body * 1.4) return true;
  }
  if (
    prev &&
    prev.low <= last.low &&
    last.close > prev.close &&
    last.close > last.open
  ) {
    return true;
  }
  return false;
}

export function structureLean(bars: TfBar[]): TfLean {
  const ema21 = lastEma(bars, 21);
  const ema50 = lastEma(bars, 50);
  const last = bars.at(-1);
  if (!last || ema21 === null || ema50 === null) return "neutral";
  if (ema21 > ema50 && last.close > ema50) return "bullish";
  if (ema21 < ema50 && last.close < ema50) return "bearish";
  if (last.close > ema21) return "bullish";
  if (last.close < ema21) return "bearish";
  return "neutral";
}

export function isBullishPullback(bars: TfBar[]): boolean {
  if (structureLean(bars) !== "bullish") return false;
  const last = bars.at(-1);
  const prior = bars.at(-6);
  const ema21 = lastEma(bars, 21);
  if (!last) return false;
  const recentHigh = Math.max(...bars.slice(-16).map((bar) => bar.high));
  const offHigh = last.close < recentHigh;
  const fading = !prior || last.close < prior.close || last.close < last.open;
  const taggedEma = ema21 !== null && last.low <= ema21 * 1.002;
  return offHigh && (fading || taggedEma);
}

export function isBearishRally(bars: TfBar[]): boolean {
  if (structureLean(bars) !== "bearish") return false;
  const last = bars.at(-1);
  const prior = bars.at(-6);
  const ema21 = lastEma(bars, 21);
  if (!last) return false;
  const recentLow = Math.min(...bars.slice(-16).map((bar) => bar.low));
  const offLow = last.close > recentLow;
  const bouncing = !prior || last.close > prior.close || last.close > last.open;
  const taggedEma = ema21 !== null && last.high >= ema21 * 0.998;
  return offLow && (bouncing || taggedEma);
}

export function m1Lean(bars: TfBar[]): TfLean {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  if (!last) return "neutral";
  if (bullishM1(last, prev) && !bearishM1(last, prev)) return "bullish";
  if (bearishM1(last, prev) && !bullishM1(last, prev)) return "bearish";
  const ema21 = lastEma(bars, 21);
  if (ema21 !== null) {
    if (last.close > ema21 && last.close >= last.open) return "bullish";
    if (last.close < ema21 && last.close <= last.open) return "bearish";
  }
  if (last.close > last.open) return "bullish";
  if (last.close < last.open) return "bearish";
  return "neutral";
}

export function m5BullishSetup(bars: TfBar[]): boolean {
  if (m5Momentum(bars) !== "bullish") return false;
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const ema21 = lastEma(bars, 21);
  if (!last) return false;
  const resistance = recentResistance(bars);
  const support = recentSupport(bars);
  const breakout = Boolean(prev) && prev!.close <= resistance && last.close > resistance;
  const retest =
    ema21 !== null &&
    last.low <= ema21 * 1.0015 &&
    last.close >= Math.min(ema21, support) &&
    last.close >= last.open;
  return breakout || retest;
}

export function m5BearishSetup(bars: TfBar[]): boolean {
  if (m5Momentum(bars) !== "bearish") return false;
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const ema21 = lastEma(bars, 21);
  if (!last) return false;
  const resistance = recentResistance(bars);
  const support = recentSupport(bars);
  const breakdown = Boolean(prev) && prev!.close >= support && last.close < support;
  const retest =
    ema21 !== null &&
    last.high >= ema21 * 0.9985 &&
    last.close <= Math.max(ema21, resistance) &&
    last.close <= last.open;
  return breakdown || retest;
}

function agreementSummary(input: {
  h1: H1Bias;
  m15: TfLean;
  m5: TfLean;
  m1: TfLean;
  h1Rejected: boolean;
  reversedShort: boolean;
  m15Pullback: boolean;
  m15Rally: boolean;
}): string {
  const h1 = input.h1Rejected
    ? input.reversedShort
      ? `${input.h1} (reversed)`
      : `${input.h1} (rejected)`
    : input.h1;
  const m15 = input.m15Pullback
    ? `${input.m15} pullback`
    : input.m15Rally
      ? `${input.m15} rally`
      : input.m15;
  return `H1 ${h1} · M15 ${m15} · M5 ${input.m5} · M1 ${input.m1}`;
}

function wait(
  reason: string,
  extra: Partial<OverallMarketBias>
): OverallMarketBias {
  return emptyOverallBias(reason, extra);
}

function fire(
  status: "POSSIBLE LONG" | "POSSIBLE SHORT",
  reason: string,
  confidence: number,
  extra: Partial<OverallMarketBias>
): OverallMarketBias {
  return {
    status,
    direction: status === "POSSIBLE LONG" ? "LONG" : "SHORT",
    reason,
    timeframe: OVERALL_BIAS_TF,
    agreement: extra.agreement ?? emptyAgreement,
    confidence: Math.max(1, Math.min(90, Math.round(confidence))),
    timestamp: extra.timestamp ?? new Date().toISOString(),
    dataFresh: extra.dataFresh ?? true,
    dataAgeSec: extra.dataAgeSec ?? 0,
    source: extra.source ?? "public btcusd candles",
    closedCandle: true,
  };
}

export function decideOverallBias(input: {
  h1: TfBar[];
  m15: TfBar[];
  m5: TfBar[];
  m1: TfBar[];
  nowMs?: number;
  source?: string;
  h1Closed?: boolean;
  m15Closed?: boolean;
  m5Closed?: boolean;
  m1Closed?: boolean;
}): OverallMarketBias {
  const nowMs = input.nowMs ?? Date.now();
  const timestamp = new Date(nowMs).toISOString();
  const base: Partial<OverallMarketBias> = {
    timestamp,
    source: input.source ?? "public btcusd candles",
  };

  if (!input.h1Closed || !input.m15Closed || !input.m5Closed || !input.m1Closed) {
    return wait("WAIT — waiting for candle close", {
      ...base,
      closedCandle: false,
      dataFresh: false,
    });
  }
  if (
    input.h1.length < 55 ||
    input.m15.length < 55 ||
    input.m5.length < 30 ||
    input.m1.length < 8
  ) {
    return wait("WAIT — required chart data unavailable", {
      ...base,
      closedCandle: true,
    });
  }

  const h1Last = input.h1.at(-1)!;
  const m15Last = input.m15.at(-1)!;
  const m5Last = input.m5.at(-1)!;
  const m1Last = input.m1.at(-1)!;
  const ageSec = Math.max(0, Math.round((nowMs - (m1Last.time + 60_000)) / 1000));
  const fresh =
    !isStale(new Date(m1Last.time + 60_000).toISOString(), M1_CLOSED_STALE_SEC, nowMs) &&
    !isStale(new Date(m5Last.time + 5 * 60_000).toISOString(), M5_CLOSED_STALE_SEC, nowMs) &&
    !isStale(
      new Date(m15Last.time + 15 * 60_000).toISOString(),
      M15_CLOSED_STALE_SEC,
      nowMs
    ) &&
    !isStale(new Date(h1Last.time + 60 * 60_000).toISOString(), H1_CLOSED_STALE_SEC, nowMs);
  if (!fresh) {
    return wait("WAIT — chart data stale", {
      ...base,
      dataFresh: false,
      dataAgeSec: ageSec,
      closedCandle: true,
    });
  }

  const h1 = classifyH1(input.h1);
  const m15 = structureLean(input.m15);
  const m5 = m5Momentum(input.m5);
  const m1 = m1Lean(input.m1);
  const rejectedLong = h1LongSide(h1) && h1RejectedAgainstLong(input.h1);
  const reversedShort = h1ShortSide(h1) && h1BullishReversal(input.h1);
  const m15Pullback = isBullishPullback(input.m15);
  const m15Rally = isBearishRally(input.m15);
  const agreement: OverallAgreement = {
    h1,
    m15,
    m5,
    m1,
    h1Rejected: rejectedLong || reversedShort,
    m15Pullback,
    aligned: false,
    summary: agreementSummary({
      h1,
      m15,
      m5,
      m1,
      h1Rejected: rejectedLong || reversedShort,
      reversedShort,
      m15Pullback,
      m15Rally,
    }),
  };
  const extra: Partial<OverallMarketBias> = {
    ...base,
    agreement,
    dataFresh: true,
    dataAgeSec: ageSec,
    closedCandle: true,
    confidence: 48,
  };

  if (h1 === "neutral" || m15 === "neutral") {
    return wait("WAIT — higher-timeframe direction is unclear", extra);
  }

  const longHtf = h1LongSide(h1) && m15 === "bullish";
  const shortHtf = h1ShortSide(h1) && m15 === "bearish";
  const shortLtf = m5 === "bearish" && m1 === "bearish";
  const longLtf = m5 === "bullish" && m1 === "bullish";

  if (longHtf && shortLtf && (rejectedLong || m15Pullback)) {
    return wait(HTF_PULLBACK_WAIT, { ...extra, confidence: 58 });
  }
  if (shortHtf && longLtf && (reversedShort || m15Rally)) {
    return wait(HTF_RALLY_WAIT, { ...extra, confidence: 58 });
  }
  if (h1LongSide(h1) && m15 === "bearish") {
    return wait("WAIT — H1 and M15 conflict", extra);
  }
  if (h1ShortSide(h1) && m15 === "bullish") {
    return wait("WAIT — H1 and M15 conflict", extra);
  }
  if (longHtf && (m5 === "bearish" || m1 === "bearish")) {
    return wait(
      "WAIT — bullish higher-timeframe trend with bearish short-term pullback; confirmation missing.",
      extra
    );
  }
  if (shortHtf && (m5 === "bullish" || m1 === "bullish")) {
    return wait(
      "WAIT — bearish higher-timeframe trend with bullish short-term rally; confirmation missing.",
      extra
    );
  }
  if (m5 === "neutral" || m1 === "neutral") {
    return wait("WAIT — lower-timeframe confirmation missing", extra);
  }

  const m15Ema = lastEma(input.m15, 21);
  const extended =
    m15Ema !== null &&
    (isExtended(m5Last.close, m15Ema) || isExtended(m15Last.close, m15Ema));

  if (longHtf && longLtf) {
    if (rejectedLong) {
      return wait("WAIT — H1 rejected the highs; confirmation missing", extra);
    }
    if (extended) {
      return wait("WAIT — move extended; waiting for pullback/retest", extra);
    }
    if (!m5BullishSetup(input.m5)) {
      return wait("WAIT — M5 has no bullish breakout or retest", extra);
    }
    if (!bullishM1(m1Last, input.m1.at(-2))) {
      return wait("WAIT — M1 has no bullish timing close", extra);
    }
    return fire(
      "POSSIBLE LONG",
      "H1 bullish/neutral-bullish; M15 bullish; M5 bullish breakout/retest; M1 bullish timing",
      70,
      {
        ...extra,
        agreement: { ...agreement, aligned: true },
      }
    );
  }

  if (shortHtf && shortLtf) {
    if (reversedShort) {
      return wait("WAIT — H1 printed a bullish reversal; confirmation missing", extra);
    }
    if (extended) {
      return wait("WAIT — move extended; waiting for pullback/retest", extra);
    }
    if (!m5BearishSetup(input.m5)) {
      return wait("WAIT — M5 has no bearish breakdown or retest", extra);
    }
    if (!bearishM1(m1Last, input.m1.at(-2))) {
      return wait("WAIT — M1 has no bearish timing close", extra);
    }
    return fire(
      "POSSIBLE SHORT",
      "H1 bearish/neutral-bearish; M15 bearish; M5 bearish breakdown/retest; M1 bearish timing",
      70,
      {
        ...extra,
        agreement: { ...agreement, aligned: true },
      }
    );
  }

  return wait("WAIT — timeframes conflict", extra);
}
