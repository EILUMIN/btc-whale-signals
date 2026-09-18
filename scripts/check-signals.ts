import { classifyTransaction } from "../src/lib/classify";
import { decideSignal } from "../src/lib/signals";
import type { EsploraTx } from "../src/lib/types";
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

const recent = mempoolUrl("/mempool/recent");
if (!recent.startsWith("https://mempool.space/api/mempool/recent")) {
  throw new Error(`expected absolute mempool URL, got ${recent}`);
}

console.log("ok");
