import {
  EXTENDED_REASON,
  closedBars,
  decidePossibleEntry,
  detectTrend,
  lastEma,
  type TfBar,
} from "../src/lib/possible-entry";
import {
  possibleEntryAlertKey,
  resetPossibleEntryLatch,
  shouldSendPossibleEntryAlert,
} from "../src/lib/possible-entry-alert";
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
    // 3-with-trend / 2-counter keeps RSI out of the extreme 78/22 bands
    // while still leaving a clear EMA21/50 trend.
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

const t0 = Date.parse("2026-09-21T12:00:00.000Z");
const m15i = 15 * 60_000;
const m5i = 5 * 60_000;
const m1i = 60_000;

const bullM15 = grind({ start: 74_000, n: 60, interval: m15i, t0, bias: 28 });
assert(detectTrend(bullM15) === "bullish", `m15 trend ${detectTrend(bullM15)}`);
const bearM15 = grind({ start: 86_000, n: 60, interval: m15i, t0, bias: -28 });
assert(detectTrend(bearM15) === "bearish", `m15 bear ${detectTrend(bearM15)}`);

function nowFor(bars: TfBar[], interval: number) {
  const last = bars.at(-1)!;
  return last.time + interval;
}

function bullM1(tEnd: number): TfBar[] {
  const bars = grind({
    start: 80_000,
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
    start: 80_000,
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

const bullM5 = grind({ start: 79_200, n: 50, interval: m5i, t0, bias: 12 });
const resistance = Math.max(...bullM5.slice(-16, -1).map((bar) => bar.high));
const bullBreakM5 = withLast(bullM5, {
  open: resistance - 8,
  low: resistance - 16,
  high: resistance + 12,
  close: resistance + 6,
  volume: 80,
});
const breakNow = nowFor(bullBreakM5, m5i);
const breakout = decidePossibleEntry({
  m15: bullM15,
  m5: bullBreakM5,
  m1: bullM1(breakNow - m1i),
  nowMs: breakNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
  esploraSource: "mempool.space",
  whaleSignal: "WAIT",
});
assert(breakout.status === "POSSIBLE LONG", `breakout ${breakout.status} ${breakout.reason}`);
assert(breakout.entryLow !== null && breakout.entryHigh !== null, "entry zone");
assert(breakout.stop !== null && breakout.tp1 !== null && breakout.tp2 !== null, "levels");
assert((breakout.rr ?? 0) >= 1.4, `rr ${breakout.rr}`);
assert(breakout.whaleConfirmation === "NOT CONFIRMED", breakout.whaleConfirmation);
assert(breakout.closedCandle, "closed candles");

const ema21Bull = lastEma(bullM5, 21) ?? bullM5.at(-1)!.close;
const lastBull = bullM5.at(-1)!;
const emaPullM5 = withLast(bullM5, {
  open: lastBull.close - 3,
  close: lastBull.close + 5,
  high: lastBull.close + 14,
  low: Math.min(ema21Bull, lastBull.low) - 8,
  volume: 70,
});
const pullNow = nowFor(emaPullM5, m5i);
const pullback = decidePossibleEntry({
  m15: bullM15,
  m5: emaPullM5,
  m1: bullM1(pullNow - m1i),
  nowMs: pullNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
  esploraSource: "mempool.space",
  whaleSignal: "BUY",
});
assert(pullback.status === "POSSIBLE LONG", `pullback ${pullback.status} ${pullback.reason}`);
assert(pullback.whaleConfirmation === "CONFIRMED", pullback.whaleConfirmation);

const bearM5 = grind({ start: 81_800, n: 50, interval: m5i, t0, bias: -12 });
const support = Math.min(...bearM5.slice(-16, -1).map((bar) => bar.low));
const bearBreakM5 = withLast(bearM5, {
  open: support + 8,
  high: support + 16,
  low: support - 12,
  close: support - 6,
  volume: 80,
});
const downNow = nowFor(bearBreakM5, m5i);
const breakdown = decidePossibleEntry({
  m15: bearM15,
  m5: bearBreakM5,
  m1: bearM1(downNow - m1i),
  nowMs: downNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
  source: "test",
});
assert(breakdown.status === "POSSIBLE SHORT", `breakdown ${breakdown.status} ${breakdown.reason}`);

const ema21Bear = lastEma(bearM5, 21) ?? bearM5.at(-1)!.close;
const lastBear = bearM5.at(-1)!;
const bearRetestM5 = withLast(bearM5, {
  open: lastBear.close + 3,
  close: lastBear.close - 5,
  low: lastBear.close - 14,
  high: Math.max(ema21Bear, lastBear.high) + 8,
  volume: 70,
});
const retestNow = nowFor(bearRetestM5, m5i);
const retest = decidePossibleEntry({
  m15: bearM15,
  m5: bearRetestM5,
  m1: bearM1(retestNow - m1i),
  nowMs: retestNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(retest.status === "POSSIBLE SHORT", `retest ${retest.status} ${retest.reason}`);

const extendedM5 = withLast(bullBreakM5, {
  close: resistance * 1.02,
  high: resistance * 1.021,
  open: resistance * 1.01,
  volume: 90,
});
const extNow = nowFor(extendedM5, m5i);
const extended = decidePossibleEntry({
  m15: bullM15,
  m5: extendedM5,
  m1: bullM1(extNow - m1i),
  nowMs: extNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(extended.status === "WAIT", `extended ${extended.status}`);
assert(extended.reason === EXTENDED_REASON, extended.reason);

const stale = decidePossibleEntry({
  m15: bullM15,
  m5: bullBreakM5,
  m1: bullM1(breakNow - m1i),
  nowMs: breakNow + 30 * 60_000,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(stale.status === "WAIT", "stale");
assert(stale.reason.toLowerCase().includes("stale"), stale.reason);

const conflict = decidePossibleEntry({
  m15: bullM15,
  m5: bearM5,
  m1: bullM1(nowFor(bearM5, m5i) - m1i),
  nowMs: nowFor(bearM5, m5i),
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(conflict.status === "WAIT", "conflict");
assert(conflict.reason.toLowerCase().includes("contradictory"), conflict.reason);

const unfinished = decidePossibleEntry({
  m15: bullM15,
  m5: bullBreakM5,
  m1: bullM1(breakNow - m1i),
  nowMs: breakNow,
  m15Closed: false,
  m5Closed: true,
  m1Closed: true,
});
assert(unfinished.status === "WAIT", "unfinished");
assert(unfinished.reason.includes("candle close"), unfinished.reason);

const closed = closedBars(
  [{ time: t0, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
  m5i,
  t0 + m5i - 1
);
assert(closed.length === 0, "forming candle excluded");

resetPossibleEntryLatch();
assert(shouldSendPossibleEntryAlert(breakout, breakNow), "first possible long notifies");
assert(possibleEntryAlertKey(breakout)?.startsWith("POSSIBLE LONG"), "alert key");
assert(!shouldSendPossibleEntryAlert(stale, breakNow), "WAIT does not notify");
const latched = { key: possibleEntryAlertKey(breakout)!, at: breakNow };
assert(
  !shouldSendPossibleEntryAlert(breakout, breakNow + 60_000, latched),
  "same possible-entry is cooled down"
);
assert(
  shouldSendPossibleEntryAlert(breakout, breakNow + 31 * 60_000, latched),
  "possible-entry may notify again after cooldown"
);

const missing = decidePossibleEntry({
  m15: [],
  m5: [],
  m1: [],
  nowMs: breakNow,
  m15Closed: true,
  m5Closed: true,
  m1Closed: true,
});
assert(missing.status === "WAIT", "missing data");
assert(missing.reason.toLowerCase().includes("unavailable"), missing.reason);

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

console.log("possible-entry ok", {
  breakout: breakout.status,
  pullback: pullback.status,
  breakdown: breakdown.status,
  retest: retest.status,
  extended: extended.reason,
  stale: stale.reason,
  conflict: conflict.reason,
  whale: whaleStillWorks.signal,
});
