import { classifyTransaction } from "../src/lib/classify";
import { decideSignal } from "../src/lib/signals";
import { moneyFlowFor, tradePlanFor } from "../src/lib/trade-plan";
import type { EsploraTx, WhaleSignal } from "../src/lib/types";
import { mempoolUrl } from "../src/lib/urls";

const SATS = 100_000_000;

function makeTx(
  fromAddress: string,
  toAddress: string,
  btc: number
): EsploraTx {
  const sats = btc * SATS;
  return {
    txid: "test",
    vin: [
      {
        prevout: { scriptpubkey_address: fromAddress, value: sats + 1000 },
      },
    ],
    vout: [
      { scriptpubkey_address: toAddress, value: sats },
      { scriptpubkey_address: fromAddress, value: 1000 },
    ],
    status: { confirmed: true, block_time: 1_700_000_000, block_height: 1 },
  };
}

const binance = "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo";
const wallet = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

const inflow = classifyTransaction(makeTx(wallet, binance, 612));
const outflow = classifyTransaction(makeTx(binance, wallet, 800));
const sell = decideSignal(inflow, 76000, [], 500);
const buy = decideSignal(outflow, 76000, [], 500);

console.log("inflow", inflow.movement, sell.recommendation, sell.keyLevel.kind);
console.log("outflow", outflow.movement, buy.recommendation, buy.keyLevel.kind);

if (inflow.movement !== "Wallet to Exchange") throw new Error("inflow movement");
if (outflow.movement !== "Exchange to Wallet") throw new Error("outflow movement");
if (sell.signal !== "SELL") throw new Error("sell signal");
if (buy.signal !== "BUY") throw new Error("buy signal");
if (sell.keyLevel.noteKey !== "inflow") throw new Error("inflow note key");
if (buy.keyLevel.noteKey !== "outflow") throw new Error("outflow note key");

const buySignal = {
  signal: "BUY",
  movement: outflow.movement,
  priceUsd: 76606.61,
  timestampUnix: 1,
  keyLevel: buy.keyLevel,
} as WhaleSignal;
const buyPlan = tradePlanFor(buySignal);
if (!buyPlan) throw new Error("buy plan missing");
if (buyPlan.side !== "BUY") throw new Error("buy side");
if (moneyFlowFor(buySignal) !== "out") throw new Error("buy is money OUT of exchange");
if (buyPlan.exit <= buyPlan.entry) throw new Error("buy exit must be above entry");
if (buyPlan.exit >= buyPlan.entry * 1.5) {
  throw new Error(`buy TP must not be 90% of BTC price, got ${buyPlan.exit}`);
}
if (buyPlan.rMultiple !== 2.7) throw new Error(`expected 2.7R got ${buyPlan.rMultiple}`);

const sellSignal = {
  signal: "SELL",
  movement: inflow.movement,
  priceUsd: 76606.61,
  timestampUnix: 1,
  keyLevel: sell.keyLevel,
} as WhaleSignal;
const sellPlan = tradePlanFor(sellSignal);
if (!sellPlan) throw new Error("sell plan missing");
if (sellPlan.side !== "SELL") throw new Error("sell side");
if (moneyFlowFor(sellSignal) !== "in") throw new Error("sell is money IN to exchange");
if (sellPlan.exit >= sellPlan.entry) throw new Error("sell exit must be below entry");
if (sellPlan.exit <= sellPlan.entry * 0.5) {
  throw new Error(
    `sell TP must not dump 90% of BTC price (old bug $6,493). got ${sellPlan.exit}`
  );
}
if (sellPlan.exit === 7660.66) throw new Error("regressed to 90% of spot");

const screenshotSell = {
  signal: "SELL",
  movement: "Wallet to Exchange",
  priceUsd: 64935.44,
  timestampUnix: 1_723_297_267,
  keyLevel: {
    kind: "resistance",
    price: 64935.44,
    zoneLow: 64935.44,
    zoneHigh: 65260.12,
    noteKey: "inflow",
    note: "",
  },
} as WhaleSignal;
const live = 76000;
const liveSell = tradePlanFor(screenshotSell, live);
if (!liveSell) throw new Error("live sell plan missing");
if (liveSell.entry !== live) throw new Error(`entry should be live ${live}, got ${liveSell.entry}`);
if (liveSell.exit === 6493.54 || liveSell.exit < 50000) {
  throw new Error(`screenshot bug still present: exit ${liveSell.exit}`);
}
if (!liveSell.stalePrint) throw new Error("Aug print vs live 76k should be marked stale");
if (liveSell.usedLivePrice !== true) throw new Error("must use live price");
if (Math.abs(liveSell.exit - (live - 2.7 * liveSell.riskUsd)) > 0.05) {
  throw new Error(`exit should be entry - 2.7R, got ${liveSell.exit}`);
}

const liveBuy = tradePlanFor(buySignal, live);
if (!liveBuy || liveBuy.entry !== live) throw new Error("live buy entry");
if (liveBuy.exit <= live) throw new Error("live buy exit");

const recent = mempoolUrl("/mempool/recent");
if (!recent.startsWith("https://mempool.space/api/mempool/recent")) {
  throw new Error(`expected absolute mempool URL, got ${recent}`);
}

console.log("buy", buyPlan.entry, "→", buyPlan.exit, "stop", buyPlan.stop);
console.log("sell", sellPlan.entry, "→", sellPlan.exit, "stop", sellPlan.stop);
console.log("live sell", liveSell.entry, "→", liveSell.exit, "stop", liveSell.stop);
console.log("ok");
