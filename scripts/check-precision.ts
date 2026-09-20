import {
  atr,
  buildPrecisionPlan,
  confirmedLabeledFlow,
  cvdSlope,
  decidePrecisionSetup,
} from "../src/lib/precision";
import { emptyFutures, type FuturesSnapshot } from "../src/lib/futures";
import {
  decideM1Confluence,
  emptyOnchainFlow,
  type FlowPrint,
  type M1Bar,
  type WhaleWall,
} from "../src/lib/m1";
import { loadRiskSettings } from "../src/lib/risk-settings";
import { runSyntheticBacktest } from "./backtest-precision";
import { resetPaperJournal } from "../src/lib/paper";

function bar(partial: Partial<M1Bar> & { close: number }): M1Bar {
  const close = partial.close;
  return {
    time: partial.time ?? 1,
    open: partial.open ?? close,
    high: partial.high ?? close + 30,
    low: partial.low ?? close - 30,
    close,
    volume: partial.volume ?? 10,
    buyVolume: partial.buyVolume ?? 8,
    sellVolume: partial.sellVolume ?? 3,
  };
}

function wall(side: "bid" | "ask", price: number, btc: number): WhaleWall {
  return {
    side,
    price,
    priceLow: price - 10,
    priceHigh: price + 10,
    btc,
    venues: ["binance"],
    whale: btc >= 500,
  };
}

function print(kind: FlowPrint["kind"], btc: number, confirmed: boolean): FlowPrint {
  return {
    txid: `${kind}-${btc}-${confirmed}`,
    btc,
    kind,
    when: "2026-09-20T00:00:00.000Z",
    confirmed,
    confirmations: confirmed ? 3 : 0,
    pending: !confirmed,
    etaMinutes: confirmed ? 0 : 10,
    etaLabel: confirmed ? "in a block" : "~10 min",
    fromLabel: kind === "inflow" ? "Wallet" : "Binance",
    toLabel: kind === "inflow" ? "Binance" : "Wallet",
    explorerUrl: "https://mempool.space/tx/x",
  };
}

function futures(partial: Partial<FuturesSnapshot> = {}): FuturesSnapshot {
  return {
    ok: true,
    stale: false,
    missingCore: false,
    conflict: false,
    source: "test",
    timestamp: new Date().toISOString(),
    futuresPrice: 80_100,
    volume: 2e9,
    openInterest: 85_000,
    openInterestPrev: 83_000,
    oiRising: true,
    fundingRate: 0.0001,
    longShortRatio: 1.05,
    takerBuy: 1400,
    takerSell: 900,
    takerBuyDominant: true,
    longLiquidations: 1_000_000,
    shortLiquidations: 800_000,
    liqAvailable: true,
    liqStatus: "fresh",
    liqReason: null,
    liqSource: "okx-liq · BTC-USDT-SWAP",
    liqTimestamp: new Date().toISOString(),
    liqStale: false,
    liqEventCount: 2,
    liqLongCount: 1,
    liqShortCount: 1,
    liqHttpStatus: 200,
    basis: 24,
    basisPct: 0.0003,
    basisSource: "okx · BTC-USDT-SWAP vs BTC-USDT (index)",
    basisReason: null,
    basisTimestamp: new Date().toISOString(),
    basisStale: false,
    basisAvailable: true,
    basisStatus: "fresh",
    spotIndexPrice: 80_076,
    futuresInstrument: "BTC-USDT-SWAP",
    spotInstrument: "BTC-USDT",
    metrics: [],
    waitReason: null,
    ...partial,
  };
}

const settings = loadRiskSettings();
if (settings.maxRiskUsd !== 10) throw new Error("default max risk $10");
if (settings.minRr < 1.5) throw new Error("min RR");
if (!settings.paperTrading) throw new Error("paper trading must default on");

const bars: M1Bar[] = [];
let px = 80_000;
for (let i = 0; i < 40; i += 1) {
  px += 12;
  bars.push(
    bar({
      time: i,
      close: px,
      open: px - 6,
      high: px + 18,
      low: px - 22,
      buyVolume: i >= 36 ? 20 : i > 20 ? 8 : 4,
      sellVolume: i >= 36 ? 2 : 5,
    })
  );
}
if (!(atr(bars) > 0)) throw new Error("ATR");
if (!cvdSlope(bars).rising) throw new Error("CVD should be rising on buy bars");

const pendingOnly = emptyOnchainFlow();
pendingOnly.prints = [print("outflow", 640, false)];
pendingOnly.outflows = 640;
pendingOnly.pendingBtc = 640;
const confirmed = confirmedLabeledFlow(pendingOnly);
if (confirmed.outflow !== 0) {
  throw new Error("pending mempool must not count as confirmed flow");
}

const fresh = futures();
const long = decidePrecisionSetup({
  live: px,
  vwap: px - 40,
  cvd: 18,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [wall("ask", px + 80, 90)],
  flow: {
    ...emptyOnchainFlow(),
    prints: [print("outflow", 520, true)],
    outflows: 520,
    confirmedBtc: 520,
  },
  futures: fresh,
  priceTimestamp: new Date().toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (long.direction !== "LONG" || !long.plan) {
  throw new Error(`expected LONG, got ${long.direction} ${long.waitReason}`);
}
if (long.plan.rrTp1 < 1.5) throw new Error("TP1 RR");
if (long.plan.tp2 <= long.plan.tp1) throw new Error("TP2 beyond TP1");
if (long.plan.sizeBtc !== settings.maxRiskUsd / Math.abs(long.plan.entry - long.plan.stop)) {
  // allow rounding
  const expected = settings.maxRiskUsd / Math.abs(long.plan.entry - long.plan.stop);
  if (Math.abs(long.plan.sizeBtc - expected) > 0.0001) {
    throw new Error(`size ${long.plan.sizeBtc} vs ${expected}`);
  }
}

const stale = decidePrecisionSetup({
  live: px,
  vwap: px - 40,
  cvd: 18,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [],
  flow: emptyOnchainFlow(),
  futures: emptyFutures("WAIT — DATA STALE"),
  priceTimestamp: new Date().toISOString(),
  spoofChecked: false,
  spoofCleared: false,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (stale.direction !== "WAIT" || !stale.waitReason.includes("STALE")) {
  throw new Error(`stale futures must WAIT, got ${stale.waitReason}`);
}

const oldPrice = decidePrecisionSetup({
  live: px,
  vwap: px,
  cvd: 10,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [],
  flow: emptyOnchainFlow(),
  futures: fresh,
  priceTimestamp: new Date(Date.now() - 60_000).toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (!oldPrice.waitReason.includes("price data stale")) {
  throw new Error(`stale price ${oldPrice.waitReason}`);
}

const pendingFire = decidePrecisionSetup({
  live: px,
  vwap: px - 40,
  cvd: 18,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [],
  flow: pendingOnly,
  futures: fresh,
  priceTimestamp: new Date().toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (pendingFire.direction === "LONG" && pendingOnly.prints[0].pending) {
  // pending cannot be the reason it fired; confirmed outflow is 0 so it may still LONG
  // if flow is not opposing. That's allowed. Ensure it didn't treat pending as support.
  if (pendingFire.plan?.reason.includes("confirmed outflow supports")) {
    throw new Error("pending outflow must not support LONG");
  }
}

const oppose = decidePrecisionSetup({
  live: px,
  vwap: px - 40,
  cvd: 18,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [],
  flow: {
    ...emptyOnchainFlow(),
    prints: [print("inflow", 610, true)],
    inflows: 610,
    confirmedBtc: 610,
  },
  futures: fresh,
  priceTimestamp: new Date().toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (oppose.direction !== "WAIT") {
  throw new Error("confirmed inflow must block LONG");
}

const spoof = decidePrecisionSetup({
  live: px,
  vwap: px - 40,
  cvd: 18,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [],
  flow: emptyOnchainFlow(),
  futures: fresh,
  priceTimestamp: new Date().toISOString(),
  spoofChecked: true,
  spoofCleared: false,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (!spoof.waitReason.includes("wall not confirmed")) {
  throw new Error(`spoof ${spoof.waitReason}`);
}

const shortBars: M1Bar[] = [];
let spx = 80_000;
for (let i = 0; i < 40; i += 1) {
  spx -= 12;
  shortBars.push(
    bar({
      time: i,
      close: spx,
      open: spx + 6,
      high: spx + 22,
      low: spx - 18,
      buyVolume: 3,
      sellVolume: 8,
    })
  );
}
const short = decidePrecisionSetup({
  live: spx,
  vwap: spx + 40,
  cvd: -18,
  bars: shortBars,
  bidWalls: [wall("bid", spx - 80, 90)],
  askWalls: [wall("ask", spx + 12, 540)],
  flow: {
    ...emptyOnchainFlow(),
    prints: [print("inflow", 530, true)],
    inflows: 530,
    confirmedBtc: 530,
  },
  futures: futures({
    takerBuyDominant: false,
    takerBuy: 700,
    takerSell: 1500,
    oiRising: true,
  }),
  priceTimestamp: new Date().toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (short.direction !== "SHORT" || !short.plan) {
  throw new Error(`expected SHORT got ${short.direction} ${short.waitReason}`);
}

const missingBasis = decidePrecisionSetup({
  live: px,
  vwap: px - 40,
  cvd: 18,
  bars,
  bidWalls: [wall("bid", px - 15, 560)],
  askWalls: [wall("ask", px + 80, 90)],
  flow: {
    ...emptyOnchainFlow(),
    prints: [print("outflow", 520, true)],
    outflows: 520,
    confirmedBtc: 520,
  },
  futures: futures({
    basis: null,
    basisPct: null,
    basisAvailable: false,
    basisStale: false,
    basisStatus: "unavailable",
    basisSource: null,
    basisReason: "missing spot/index price",
    basisTimestamp: null,
    spotIndexPrice: null,
  }),
  priceTimestamp: new Date().toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: Date.now(),
});
if (missingBasis.direction !== "LONG" || !missingBasis.plan) {
  throw new Error(
    `missing optional basis must not block LONG, got ${missingBasis.direction} ${missingBasis.waitReason}`
  );
}
if (
  !missingBasis.plan.reason.includes(
    "BASIS UNAVAILABLE — optional confirmation missing."
  )
) {
  throw new Error("LONG must show BASIS UNAVAILABLE note");
}
if (missingBasis.dataStale) {
  throw new Error("optional basis gap must not mark the signal stale");
}

const tinyStop = buildPrecisionPlan({
  direction: "LONG",
  live: 80_000,
  vwap: 80_000,
  bars: [bar({ close: 80_000, high: 80_001, low: 79_999 })],
  walls: [],
  wall: wall("bid", 80_000, 90),
  reason: "test",
  strength: "medium",
  settings,
});
if (tinyStop) throw new Error("too-tight stop must not produce a plan");

const whale = decideM1Confluence({
  flow: { ...emptyOnchainFlow(), inflows: 612, netflow: 612 },
  live: 65_010,
  bar: bar({ high: 65_040, low: 64_950, close: 65_010 }),
  askWalls: [wall("ask", 65_020, 720)],
  bidWalls: [],
  cvd: -18,
});
if (whale.signal !== "SELL") {
  throw new Error("existing whale SELL confluence must still compute");
}

resetPaperJournal();
const report = runSyntheticBacktest();
if (report.bars < 100) throw new Error("backtest bars");
if (typeof report.blocked !== "number") throw new Error("blocked count");
console.log("precision ok", {
  long: long.direction,
  short: short.direction,
  backtest: {
    waits: report.waits,
    blocked: report.blocked,
    longs: report.longs,
    shorts: report.shorts,
    winRate: report.winRate,
  },
});
