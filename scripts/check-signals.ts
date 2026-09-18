import {
  ATR_BREAKOUT_USD,
  RSI_BREAKOUT,
  buildRiskPlan,
  decideMatrixSignal,
  wilderAtr,
  wilderRsi,
} from "../src/lib/matrix";
import {
  formatSellEmail,
  resetAlertLatch,
  shouldFireSellAlert,
} from "../src/lib/signal-alert";
import type { MatrixSnapshot } from "../src/lib/matrix";
import { mempoolUrl } from "../src/lib/urls";

const rsis = wilderRsi(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
);
if (rsis.length < 2) throw new Error("rsi length");

const breakout = decideMatrixSignal({ rsi: 92, rsiPrev: 90, atr: 213 });
if (!breakout.breakoutLock) throw new Error("expected breakout lock at RSI 92 ATR 213");
if (breakout.lockText !== "BREAKOUT DETECTED - HOLDING SIGNALS") {
  throw new Error(`lock text: ${breakout.lockText}`);
}
if (breakout.signal !== "HOLD") throw new Error("lock must HOLD");

const noLockLowAtr = decideMatrixSignal({ rsi: 92, rsiPrev: 90, atr: 80 });
if (noLockLowAtr.breakoutLock) throw new Error("ATR 80 should not lock");

const sell = decideMatrixSignal({ rsi: 68.4, rsiPrev: 72.1, atr: 120 });
if (sell.signal !== "SELL") throw new Error(`expected SELL got ${sell.signal}`);
if (!sell.exhaustionDrop) throw new Error("exhaustion drop");

const buy = decideMatrixSignal({ rsi: 32, rsiPrev: 28, atr: 120 });
if (buy.signal !== "BUY") throw new Error(`expected BUY got ${buy.signal}`);

const plan = buildRiskPlan("SELL", 80_000, 200);
if (!plan) throw new Error("sell plan");
if (plan.entry !== 80_000) throw new Error("entry vwap");
if (plan.stop !== 80_300) throw new Error(`stop 1.5*ATR expected 80300 got ${plan.stop}`);
if (plan.takeProfit !== 79_100) throw new Error(`1:3 tp expected 79100 got ${plan.takeProfit}`);
if (plan.riskUsd !== 10) throw new Error(`1% of 1000 is 10, got ${plan.riskUsd}`);
if (Math.abs(plan.sizeBtc - 10 / 300) > 1e-6) {
  throw new Error(`size 10/300 expected 0.033333 got ${plan.sizeBtc}`);
}
if (plan.takeProfit < 50_000) {
  throw new Error("regressed to 90% of spot");
}

const buyPlan = buildRiskPlan("BUY", 80_000, 200);
if (!buyPlan || buyPlan.takeProfit !== 80_900) {
  throw new Error(`buy tp ${buyPlan?.takeProfit}`);
}

if (ATR_BREAKOUT_USD !== 150) throw new Error("ATR lock threshold");
if (RSI_BREAKOUT !== 75) throw new Error("RSI lock threshold");

const highs = [10, 12, 14, 13, 15, 16, 18, 17, 19, 21, 20, 22, 24, 23, 25, 26];
const lows = highs.map((h) => h - 2);
const closes = highs.map((h) => h - 1);
const atrs = wilderAtr(highs, lows, closes);
if (atrs.length === 0) throw new Error("atr");

if (!shouldFireSellAlert("HOLD", "SELL", false)) {
  throw new Error("HOLDING → SELL must fire");
}
if (shouldFireSellAlert("HOLD", "SELL", true)) {
  throw new Error("second SELL on same arm must not email");
}
if (shouldFireSellAlert("WAIT", "SELL", false)) {
  throw new Error("cold-start SELL without HOLDING must not email");
}
if (shouldFireSellAlert("HOLD", "WAIT", false)) {
  throw new Error("HOLDING without SELL must not email");
}

resetAlertLatch("HOLD");
const mail = formatSellEmail(plan, {
  live_rsi: 68.2,
  rsi_prev: 72,
  live_atr: 200,
  live_price: 80_000,
  live_vwap: 80_000,
  source: "binanceus + coinbase + kraken",
  scannedAt: "2026-09-18T00:00:00.000Z",
} as MatrixSnapshot);
if (!mail.subject.includes("SELL / SHORT SETUP")) throw new Error("subject");
if (!mail.text.includes("Entry (Global VWAP)")) throw new Error("entry line");
if (!mail.text.includes("Take Profit (1:3 Reward)")) throw new Error("tp line");
if (!mail.text.includes("Stop Loss (1.5× ATR)")) throw new Error("sl line");
if (!mail.text.includes("0.0333 BTC")) throw new Error(`size in email: ${mail.text}`);

const recent = mempoolUrl("/mempool/recent");
if (!recent.startsWith("https://mempool.space/api/mempool/recent")) {
  throw new Error(`expected absolute mempool URL, got ${recent}`);
}

console.log("breakout", breakout.signal, breakout.lockText);
console.log("sell plan", plan.entry, "→", plan.takeProfit, "stop", plan.stop, "size", plan.sizeBtc);
console.log("ok");
