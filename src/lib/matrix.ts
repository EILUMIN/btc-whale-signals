import { roundPrice } from "@/lib/price";

export const RSI_LEN = 14;
export const ATR_LEN = 14;
export const RSI_OVERBOUGHT = 70;
export const RSI_BREAKOUT = 75;
export const RSI_OVERSOLD = 30;
export const ATR_BREAKOUT_USD = 150;
export const SL_ATR_MULT = 1.5;
export const RR_MULT = 3;
export const WALLET_USD = 1_000;
export const RISK_PCT = 0.01;
export const BOOK_LIMIT = 50;
export const NEAR_PCT = 0.01;
export const SELL_WALL_RATIO = 2;
export const OHLCV_TF = "5m";
export const OHLCV_LIMIT = 120;
export const BREAKOUT_HOLD_TEXT = "BREAKOUT DETECTED - HOLDING SIGNALS";

export type VenueQuote = {
  name: string;
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  bidsNear: number;
  asksNear: number;
  ok: boolean;
  error: string | null;
};

export type RiskPlan = {
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  takeProfit: number;
  atr: number;
  riskPerBtc: number;
  riskUsd: number;
  walletUsd: number;
  sizeBtc: number;
  notionalUsd: number;
  rr: number;
};

export type MatrixSide = "BUY" | "SELL" | "HOLD" | "WAIT";

export type MatrixSnapshot = {
  ok: boolean;
  error: string | null;
  live_rsi: number;
  live_atr: number;
  live_vwap: number;
  live_price: number;
  rsi_prev: number;
  breakoutLock: boolean;
  lockText: string | null;
  exhaustionDrop: boolean;
  recoverFromOversold: boolean;
  signal: MatrixSide;
  recommendation: string;
  sellPlan: RiskPlan | null;
  buyPlan: RiskPlan | null;
  armedPlan: RiskPlan | null;
  venues: VenueQuote[];
  bidsNear: number;
  asksNear: number;
  heavySell: boolean;
  heavyBuy: boolean;
  bars: number;
  scannedAt: string;
  source: string;
  alertPing?: boolean;
  emailStatus?: "sent" | "skipped" | "failed" | "idle";
  emailDetail?: string;
};

export function wilderRsi(closes: number[], length = RSI_LEN): number[] {
  if (closes.length < length + 1) return [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }
  let avgG = gains.slice(0, length).reduce((a, b) => a + b, 0) / length;
  let avgL = losses.slice(0, length).reduce((a, b) => a + b, 0) / length;
  const out: number[] = [100 - 100 / (1 + avgG / (avgL || 1e-12))];
  for (let i = length; i < gains.length; i += 1) {
    avgG = (avgG * (length - 1) + gains[i]) / length;
    avgL = (avgL * (length - 1) + losses[i]) / length;
    out.push(100 - 100 / (1 + avgG / (avgL || 1e-12)));
  }
  return out;
}

export function wilderAtr(
  highs: number[],
  lows: number[],
  closes: number[],
  length = ATR_LEN
): number[] {
  if (closes.length < length + 1) return [];
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }
  let atr = trs.slice(0, length).reduce((a, b) => a + b, 0) / length;
  const out = [atr];
  for (let i = length; i < trs.length; i += 1) {
    atr = (atr * (length - 1) + trs[i]) / length;
    out.push(atr);
  }
  return out;
}

export function buildRiskPlan(
  side: "BUY" | "SELL",
  vwap: number,
  atr: number,
  walletUsd = WALLET_USD
): RiskPlan | null {
  if (!(vwap > 0) || !(atr > 0)) return null;
  const entry = roundPrice(vwap);
  const riskPerBtc = roundPrice(SL_ATR_MULT * atr);
  const riskUsd = roundPrice(walletUsd * RISK_PCT);
  if (riskPerBtc <= 0) return null;
  const stop =
    side === "SELL"
      ? roundPrice(entry + riskPerBtc)
      : roundPrice(entry - riskPerBtc);
  const takeProfit =
    side === "SELL"
      ? roundPrice(entry - RR_MULT * riskPerBtc)
      : roundPrice(entry + RR_MULT * riskPerBtc);
  const sizeBtc = Math.round((riskUsd / riskPerBtc) * 1_000_000) / 1_000_000;
  return {
    side,
    entry,
    stop,
    takeProfit,
    atr: roundPrice(atr),
    riskPerBtc,
    riskUsd,
    walletUsd,
    sizeBtc,
    notionalUsd: roundPrice(sizeBtc * entry),
    rr: RR_MULT,
  };
}

export function decideMatrixSignal(input: {
  rsi: number;
  rsiPrev: number;
  atr: number;
}): {
  signal: MatrixSide;
  breakoutLock: boolean;
  exhaustionDrop: boolean;
  recoverFromOversold: boolean;
  lockText: string | null;
  recommendation: string;
} {
  const exhaustionDrop =
    input.rsiPrev >= RSI_OVERBOUGHT && input.rsi < RSI_OVERBOUGHT;
  const recoverFromOversold =
    input.rsiPrev <= RSI_OVERSOLD && input.rsi > RSI_OVERSOLD;
  const breakoutLock =
    input.rsi > RSI_BREAKOUT && input.atr > ATR_BREAKOUT_USD;

  if (breakoutLock) {
    return {
      signal: "HOLD",
      breakoutLock: true,
      exhaustionDrop,
      recoverFromOversold,
      lockText: BREAKOUT_HOLD_TEXT,
      recommendation: BREAKOUT_HOLD_TEXT,
    };
  }
  if (exhaustionDrop) {
    return {
      signal: "SELL",
      breakoutLock: false,
      exhaustionDrop: true,
      recoverFromOversold,
      lockText: null,
      recommendation:
        "SELL / SHORT SETUP — RSI exhaustion drop below 70. Entry is live Global VWAP, not a stale whale wall.",
    };
  }
  if (recoverFromOversold) {
    return {
      signal: "BUY",
      breakoutLock: false,
      exhaustionDrop,
      recoverFromOversold: true,
      lockText: null,
      recommendation:
        "BUY / LONG SETUP — RSI lifted from oversold (<30). Entry is live Global VWAP.",
    };
  }
  return {
    signal: "WAIT",
    breakoutLock: false,
    exhaustionDrop: false,
    recoverFromOversold: false,
    lockText: null,
    recommendation:
      "Waiting for RSI to cross back below 70 (sell) or lift from <30 (buy). Generator is live; no stale $64k wall.",
  };
}
