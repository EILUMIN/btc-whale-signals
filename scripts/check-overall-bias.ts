import {
  HTF_PULLBACK_WAIT,
  classifyH1,
  decideOverallBias,
  h1RejectedAgainstLong,
  isBullishPullback,
  structureLean,
} from "../src/lib/overall-bias";
import {
  decidePossibleEntry,
  detectTrend,
  lastEma,
  m5Momentum,
  type TfBar,
} from "../src/lib/possible-entry";
import { decideM1Confluence, emptyOnchainFlow } from "../src/lib/m1";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function grind(input: {
  start: number;
  n: number;
  interval: number;
  t0: number;
  bias: number;
  volume?: number;
}): TfBar[] {
  const bars: TfBar[] = [];
  let price = input.start;
  const volume = input.volume ?? 20;
  const wick = Math.max(6, Math.abs(input.bias) * 0.35);
  for (let i = 0; i < input.n; i += 1) {
    const withTrend = i % 5 !== 2 && i % 5 !== 4;
    const pull = (withTrend ? 1 : -0.55) * input.bias;
    const open = price;
    const close = price + pull;
    bars.push({
      time: input.t0 + i * input.interval,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: volume + (i % 4),
    });
    price = close;
  }
  return bars;
}

function withLast(bars: TfBar[], patch: Partial<TfBar>): TfBar[] {
  const next = bars.slice();
  const last = next[next.length - 1];
  next[next.length - 1] = { ...last, ...patch };
  return next;
}

function nowFor(bars: TfBar[], interval: number) {
  return bars.at(-1)!.time + interval;
}

const t0 = Date.parse("2026-09-21T12:00:00.000Z");
const h1i = 60 * 60_000;
const m15i = 15 * 60_000;
const m5i = 5 * 60_000;
const m1i = 60_000;

const bullH1 = grind({ start: 80_000, n: 60, interval: h1i, t0, bias: 28 });
const bearH1 = grind({ start: 92_000, n: 60, interval: h1i, t0, bias: -28 });
assert(classifyH1(bullH1) === "bullish" || classifyH1(bullH1) === "neutral-bullish", `h1 ${classifyH1(bullH1)}`);
assert(classifyH1(bearH1) === "bearish" || classifyH1(bearH1) === "neutral-bearish", `h1 bear ${classifyH1(bearH1)}`);

const bullM15 = grind({ start: 84_000, n: 60, interval: m15i, t0, bias: 16 });
const bearM15 = grind({ start: 90_000, n: 60, interval: m15i, t0, bias: -16 });
assert(structureLean(bullM15) === "bullish", `m15 ${structureLean(bullM15)} trend ${detectTrend(bullM15)}`);
assert(structureLean(bearM15) === "bearish", `m15 bear ${structureLean(bearM15)}`);

function bullM1(tEnd: number): TfBar[] {
  const bars = grind({
    start: bullM15.at(-1)!.close - 40,
    n: 20,
    interval: m1i,
    t0: tEnd - 19 * m1i,
    bias: 6,
  });
  const prev = bars[bars.length - 2];
  return withLast(bars, {
    open: prev.close - 4,
    low: prev.close - 8,
    high: prev.high + 20,
    close: prev.high + 12,
    volume: 30,
  });
}

function bearM1(tEnd: number): TfBar[] {
  const bars = grind({
    start: bullM15.at(-1)!.close + 40,
    n: 20,
    interval: m1i,
    t0: tEnd - 19 * m1i,
    bias: -6,
  });
  const prev = bars[bars.length - 2];
  return withLast(bars, {
    open: prev.close + 4,
    high: prev.close + 8,
    low: prev.low - 20,
    close: prev.low - 12,
    volume: 30,
  });
}

const lastH1 = bullH1.at(-1)!;
const rejectedH1 = withLast(bullH1, {
  open: lastH1.close + 8,
  high: lastH1.close + 12,
  low: lastH1.close - 420,
  close: lastH1.close - 380,
  volume: 40,
});
assert(h1RejectedAgainstLong(rejectedH1), "h1 rejected");
assert(classifyH1(rejectedH1) === "bullish" || classifyH1(rejectedH1) === "neutral-bullish", classifyH1(rejectedH1));

const lastM15 = bullM15.at(-1)!;
const pullM15 = withLast(bullM15, {
  open: lastM15.close,
  high: lastM15.close + 10,
  low: lastM15.close - 180,
  close: lastM15.close - 140,
  volume: 30,
});
assert(structureLean(pullM15) === "bullish", `pull m15 ${structureLean(pullM15)}`);
assert(isBullishPullback(pullM15), "m15 pullback");

const bearM5 = grind({
  start: pullM15.at(-1)!.close + 20,
  n: 50,
  interval: m5i,
  t0,
  bias: -12,
});
assert(m5Momentum(bearM5) === "bearish", `m5 ${m5Momentum(bearM5)}`);

const setupNow = nowFor(bearM5, m5i);
const currentSetup = decideOverallBias({
  h1: rejectedH1,
  m15: pullM15,
  m5: bearM5,
  m1: bearM1(setupNow - m1i),
  nowMs: setupNow,
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(currentSetup.status === "WAIT", `current ${currentSetup.status} ${currentSetup.reason}`);
assert(currentSetup.reason === HTF_PULLBACK_WAIT, currentSetup.reason);
assert(currentSetup.agreement.h1 === "bullish" || currentSetup.agreement.h1 === "neutral-bullish", currentSetup.agreement.summary);
assert(currentSetup.agreement.m15 === "bullish", currentSetup.agreement.summary);
assert(currentSetup.agreement.m5 === "bearish", currentSetup.agreement.summary);
assert(currentSetup.agreement.m1 === "bearish", currentSetup.agreement.summary);

const bullM5 = grind({
  start: bullM15.at(-1)!.close - 60,
  n: 50,
  interval: m5i,
  t0,
  bias: 12,
});
const resistance = Math.max(...bullM5.slice(-16, -1).map((bar) => bar.high));
const bullBreakM5 = withLast(bullM5, {
  open: resistance - 8,
  low: resistance - 16,
  high: resistance + 12,
  close: resistance + 6,
  volume: 80,
});
const longNow = nowFor(bullBreakM5, m5i);
const contH1 = withLast(bullH1, {
  open: lastH1.close - 10,
  low: lastH1.close - 16,
  high: lastH1.close + 40,
  close: lastH1.close + 28,
  volume: 40,
});
const alignedLong = decideOverallBias({
  h1: contH1,
  m15: bullM15,
  m5: bullBreakM5,
  m1: bullM1(longNow - m1i),
  nowMs: longNow,
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(alignedLong.status === "POSSIBLE LONG", `long ${alignedLong.status} ${alignedLong.reason}`);
assert(alignedLong.agreement.aligned, alignedLong.agreement.summary);

const bearBreakM5 = grind({
  start: bearM15.at(-1)!.close + 60,
  n: 50,
  interval: m5i,
  t0,
  bias: -12,
});
const support = Math.min(...bearBreakM5.slice(-16, -1).map((bar) => bar.low));
const bearDownM5 = withLast(bearBreakM5, {
  open: support + 8,
  high: support + 16,
  low: support - 12,
  close: support - 6,
  volume: 80,
});
const shortNow = nowFor(bearDownM5, m5i);
const lastBearH1 = bearH1.at(-1)!;
const contBearH1 = withLast(bearH1, {
  open: lastBearH1.close + 10,
  high: lastBearH1.close + 16,
  low: lastBearH1.close - 40,
  close: lastBearH1.close - 28,
  volume: 40,
});
const alignedShort = decideOverallBias({
  h1: contBearH1,
  m15: bearM15,
  m5: bearDownM5,
  m1: bearM1(shortNow - m1i),
  nowMs: shortNow,
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(alignedShort.status === "POSSIBLE SHORT", `short ${alignedShort.status} ${alignedShort.reason}`);

const conflict = decideOverallBias({
  h1: bullH1,
  m15: bearM15,
  m5: bearM5,
  m1: bearM1(nowFor(bearM5, m5i) - m1i),
  nowMs: nowFor(bearM5, m5i),
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(conflict.status === "WAIT", "conflict");
assert(conflict.reason.toLowerCase().includes("conflict"), conflict.reason);

const stale = decideOverallBias({
  h1: rejectedH1,
  m15: pullM15,
  m5: bearM5,
  m1: bearM1(setupNow - m1i),
  nowMs: setupNow + 3 * 60 * 60_000,
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(stale.status === "WAIT", "stale");
assert(stale.reason.toLowerCase().includes("stale"), stale.reason);

const missing = decideOverallBias({
  h1: [],
  m15: [],
  m5: [],
  m1: [],
  nowMs: setupNow,
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(missing.status === "WAIT", "missing");
assert(missing.reason.toLowerCase().includes("unavailable"), missing.reason);

const unfinished = decideOverallBias({
  h1: bullH1,
  m15: bullM15,
  m5: bullBreakM5,
  m1: bullM1(longNow - m1i),
  nowMs: longNow,
  h1Closed: false,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(unfinished.status === "WAIT", "unfinished");
assert(unfinished.reason.includes("candle close"), unfinished.reason);

const ema15 = lastEma(bullM15, 21) ?? bullM15.at(-1)!.close;
const extendedM5 = withLast(bullBreakM5, {
  close: ema15 * 1.02,
  high: ema15 * 1.021,
  open: ema15 * 1.01,
  volume: 90,
});
const extNow = nowFor(extendedM5, m5i);
const extended = decideOverallBias({
  h1: contH1,
  m15: bullM15,
  m5: extendedM5,
  m1: bullM1(extNow - m1i),
  nowMs: extNow,
  h1Closed: true,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(extended.status === "WAIT", `extended ${extended.status}`);
assert(extended.reason.toLowerCase().includes("extended"), extended.reason);

const entryStillIsolated = decidePossibleEntry({
  m15: bullM15,
  m5: bullBreakM5,
  m1: bullM1(longNow - m1i),
  nowMs: longNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(
  entryStillIsolated.status === "POSSIBLE LONG" || entryStillIsolated.status === "WAIT",
  `entry isolated ${entryStillIsolated.status} ${entryStillIsolated.reason}`
);

const whaleStillWorks = decideM1Confluence({
  flow: { ...emptyOnchainFlow(), inflows: 612, netflow: 612 },
  live: 65_010,
  bar: {
    time: 1,
    open: 65_000,
    high: 65_040,
    low: 64_950,
    close: 65_010,
    volume: 10,
    buyVolume: 3,
    sellVolume: 8,
  },
  askWalls: [
    {
      side: "ask",
      price: 65_020,
      priceLow: 65_010,
      priceHigh: 65_030,
      btc: 720,
      venues: ["binance"],
      whale: true,
    },
  ],
  bidWalls: [],
  cvd: -18,
});
assert(whaleStillWorks.signal === "SELL", "existing whale SELL must still compute");

console.log("overall-bias ok", {
  current: currentSetup.reason,
  agreement: currentSetup.agreement.summary,
  long: alignedLong.status,
  short: alignedShort.status,
  conflict: conflict.reason,
  stale: stale.reason,
  extended: extended.reason,
  whale: whaleStillWorks.signal,
});
