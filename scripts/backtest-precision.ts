import { atr, buildPrecisionPlan, decidePrecisionSetup } from "../src/lib/precision";
import type { FuturesSnapshot } from "../src/lib/futures";
import { emptyOnchainFlow, type M1Bar, type WhaleWall } from "../src/lib/m1";
import { loadRiskSettings } from "../src/lib/risk-settings";

export type BacktestReport = {
  bars: number;
  longs: number;
  shorts: number;
  waits: number;
  blocked: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number | null;
  avgR: number | null;
  maxDrawdownR: number;
  losingStreak: number;
  falseSignals: number;
  note: string;
};

function bar(
  time: number,
  close: number,
  extra: Partial<M1Bar> = {}
): M1Bar {
  return {
    time,
    open: extra.open ?? close,
    high: extra.high ?? close + 20,
    low: extra.low ?? close - 20,
    close,
    volume: extra.volume ?? 12,
    buyVolume: extra.buyVolume ?? 7,
    sellVolume: extra.sellVolume ?? 5,
  };
}

function wall(side: "bid" | "ask", price: number, btc: number): WhaleWall {
  return {
    side,
    price,
    priceLow: price - 12,
    priceHigh: price + 12,
    btc,
    venues: ["binance"],
    whale: btc >= 500,
  };
}

function futures(partial: Partial<FuturesSnapshot> = {}): FuturesSnapshot {
  return {
    ok: true,
    stale: false,
    missingCore: false,
    conflict: false,
    source: "replay",
    timestamp: new Date().toISOString(),
    futuresPrice: 80_000,
    volume: 1_000_000_000,
    openInterest: 90_000,
    openInterestPrev: 88_000,
    oiRising: true,
    fundingRate: 0.0001,
    longShortRatio: 1.1,
    takerBuy: 1200,
    takerSell: 800,
    takerBuyDominant: true,
    longLiquidations: 2_000_000,
    shortLiquidations: 1_000_000,
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
    basis: 32,
    basisPct: 0.0004,
    basisSource: "okx · BTC-USDT-SWAP vs BTC-USDT (index)",
    basisReason: null,
    basisTimestamp: new Date().toISOString(),
    basisStale: false,
    basisAvailable: true,
    basisStatus: "fresh",
    spotIndexPrice: 79_968,
    futuresInstrument: "BTC-USDT-SWAP",
    spotInstrument: "BTC-USDT",
    metrics: [],
    waitReason: null,
    ...partial,
  };
}

function replay(bars: M1Bar[]): BacktestReport {
  const settings = loadRiskSettings();
  let longs = 0;
  let shorts = 0;
  let waits = 0;
  let blocked = 0;
  let wins = 0;
  let losses = 0;
  let expired = 0;
  const rs: number[] = [];
  let open: {
    dir: "LONG" | "SHORT";
    entry: number;
    stop: number;
    tp1: number;
    tp2: number;
    until: number;
  } | null = null;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let streak = 0;
  let worst = 0;
  let falseSignals = 0;

  for (let i = 20; i < bars.length; i += 1) {
    const window = bars.slice(0, i + 1);
    const live = window[i].close;
    const vwap =
      window.reduce((s, b) => s + ((b.high + b.low + b.close) / 3) * b.volume, 0) /
      window.reduce((s, b) => s + b.volume, 0);
    const cvd = window.reduce((s, b) => s + (b.buyVolume - b.sellVolume), 0);
    const up = window[i].close >= window[i].open;
    const bidWalls = [wall("bid", live - 40, up ? 520 : 90)];
    const askWalls = [wall("ask", live + 40, up ? 90 : 520)];
    if (open) {
      if (open.dir === "LONG") {
        if (live <= open.stop) {
          losses += 1;
          falseSignals += 1;
          rs.push(-1);
          equity -= 1;
          streak += 1;
          worst = Math.max(worst, streak);
          open = null;
        } else if (live >= open.tp2) {
          wins += 1;
          const r = (open.tp2 - open.entry) / Math.abs(open.entry - open.stop);
          rs.push(r);
          equity += r;
          streak = 0;
          open = null;
        }
      } else if (live >= open.stop) {
        losses += 1;
        falseSignals += 1;
        rs.push(-1);
        equity -= 1;
        streak += 1;
        worst = Math.max(worst, streak);
        open = null;
      } else if (live <= open.tp2) {
        wins += 1;
        const r = (open.entry - open.tp2) / Math.abs(open.entry - open.stop);
        rs.push(r);
        equity += r;
        streak = 0;
        open = null;
      }
      if (open && window[i].time > open.until) {
        expired += 1;
        open = null;
      }
    }
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);

    const fut = futures({
      futuresPrice: live,
      takerBuyDominant: up,
      takerBuy: up ? 1500 : 700,
      takerSell: up ? 700 : 1500,
      oiRising: true,
    });
    const decision = decidePrecisionSetup({
      live,
      vwap,
      cvd,
      bars: window,
      bidWalls,
      askWalls,
      flow: emptyOnchainFlow(),
      futures: fut,
      priceTimestamp: new Date().toISOString(),
      spoofChecked: true,
      spoofCleared: true,
      venuesOk: 3,
      active: open
        ? { direction: open.dir, expiryUnix: open.until }
        : null,
      settings,
      nowMs: Date.now(),
    });
    if (decision.direction === "WAIT") {
      waits += 1;
      if (decision.waitReason.startsWith("WAIT —")) blocked += 1;
      continue;
    }
    if (!decision.plan) {
      waits += 1;
      blocked += 1;
      continue;
    }
    if (decision.direction === "LONG") longs += 1;
    else shorts += 1;
    open = {
      dir: decision.direction,
      entry: decision.plan.entry,
      stop: decision.plan.stop,
      tp1: decision.plan.tp1,
      tp2: decision.plan.tp2,
      until: decision.plan.expiryUnix,
    };
  }

  const closed = wins + losses;
  return {
    bars: bars.length,
    longs,
    shorts,
    waits,
    blocked,
    wins,
    losses,
    expired,
    winRate: closed ? wins / closed : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    maxDrawdownR: maxDd,
    losingStreak: worst,
    falseSignals,
    note: "Synthetic M1 replay. Fees/slippage not live fills. Not a profit guarantee.",
  };
}

export function runSyntheticBacktest(): BacktestReport {
  const bars: M1Bar[] = [];
  let px = 80_000;
  for (let i = 0; i < 240; i += 1) {
    const wave = Math.sin(i / 9) * 90;
    const drift = i % 17 === 0 ? -70 : 18;
    px = Math.max(70_000, px + drift + wave * 0.08);
    const up = drift > 0;
    bars.push(
      bar(1_700_000_000_000 + i * 60_000, px, {
        open: px - (up ? 8 : -8),
        high: px + 25,
        low: px - 25,
        buyVolume: up ? 9 : 4,
        sellVolume: up ? 4 : 9,
      })
    );
  }
  if (!(atr(bars) > 0)) {
    throw new Error("backtest ATR");
  }
  void buildPrecisionPlan;
  return replay(bars);
}
