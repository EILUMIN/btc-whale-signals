import {
  PU_PRIME_GAP_USD,
  PU_PRIME_SPREAD_USD,
  TAPE_BTC,
  WHALE_BTC,
  buildWallPlan,
  clusterWalls,
  cvdFromBars,
  decideM1Confluence,
  emptyOnchainFlow,
  lotsGuide,
  puPrimeQuote,
  toPuPrimePlan,
  wallStillReal,
  type M1Bar,
  type WhaleWall,
} from "../src/lib/m1";
import {
  M1_ALERT_SUBJECT,
  formatM1Email,
  isDiscordWebhookUrl,
  resetAlertLatch,
  sendDiscordAlert,
  shouldFireM1Alert,
} from "../src/lib/signal-alert";
import {
  confirmationsFor,
  estimateArrival,
} from "../src/lib/mempool";
import { esploraBases, mempoolUrl } from "../src/lib/urls";
import { TRACKED_EXCHANGE_ADDRESSES } from "../src/lib/exchange-addresses";
import { dictionaries } from "../src/lib/i18n";

function bar(partial: Partial<M1Bar> & { close: number }): M1Bar {
  const close = partial.close;
  return {
    time: partial.time ?? 1,
    open: partial.open ?? close,
    high: partial.high ?? close,
    low: partial.low ?? close,
    close,
    volume: partial.volume ?? 10,
    buyVolume: partial.buyVolume ?? 6,
    sellVolume: partial.sellVolume ?? 4,
  };
}

function wall(
  side: "bid" | "ask",
  price: number,
  btc: number,
  whale = true
): WhaleWall {
  return {
    side,
    price,
    priceLow: price - 10,
    priceHigh: price + 10,
    btc,
    venues: ["binance"],
    whale,
  };
}

const emptyFlow = emptyOnchainFlow();

const clustered = clusterWalls(
  [
    { price: 64000, btc: 200, venue: "binance" },
    { price: 64010, btc: 350, venue: "coinbase" },
    { price: 64100, btc: 90, venue: "kraken" },
    { price: 12, btc: 90000, venue: "coinbase" },
  ],
  "bid"
);
if (clustered.some((w) => w.price < 25)) {
  throw new Error("penny bids must not become a $0 whale wall");
}
const whale = clustered.find((w) => w.price === 64000);
if (!whale || whale.btc < 500) {
  throw new Error(`expected clustered 64000 wall >=500, got ${JSON.stringify(clustered)}`);
}
if (!whale.whale) throw new Error("550 BTC cluster must be a whale wall");

const waitNoFlow = decideM1Confluence({
  flow: emptyFlow,
  live: 64005,
  bar: bar({ high: 64020, low: 63980, close: 64005 }),
  askWalls: [wall("ask", 64100, 600)],
  bidWalls: [wall("bid", 64000, 600)],
  cvd: 12,
});
if (waitNoFlow.signal !== "WAIT") {
  throw new Error(`no flow must WAIT, got ${waitNoFlow.signal}`);
}

const sell = decideM1Confluence({
  flow: { ...emptyFlow, inflows: 612, netflow: 612 },
  live: 65010,
  bar: bar({ high: 65040, low: 64950, close: 65010 }),
  askWalls: [wall("ask", 65020, 720)],
  bidWalls: [],
  cvd: -18,
});
if (sell.signal !== "SELL") throw new Error(`expected SELL got ${sell.signal}`);

const sellNoCvd = decideM1Confluence({
  flow: { ...emptyFlow, inflows: 612, netflow: 612 },
  live: 65010,
  bar: bar({ high: 65040, low: 64950, close: 65010 }),
  askWalls: [wall("ask", 65020, 720)],
  bidWalls: [],
  cvd: 22,
});
if (sellNoCvd.signal !== "WAIT") {
  throw new Error("SELL without selling CVD must WAIT");
}

const buy = decideM1Confluence({
  flow: { ...emptyFlow, outflows: 540, netflow: -540 },
  live: 64020,
  bar: bar({ high: 64100, low: 63990, close: 64020 }),
  askWalls: [],
  bidWalls: [wall("bid", 64000, 800)],
  cvd: 15,
});
if (buy.signal !== "BUY") throw new Error(`expected BUY got ${buy.signal}`);

const unlabeledDoesNotSell = decideM1Confluence({
  flow: { ...emptyFlow, unlabeled: 640, netflow: 0 },
  live: 65010,
  bar: bar({ high: 65040, low: 64950, close: 65010 }),
  askWalls: [wall("ask", 65020, 720)],
  bidWalls: [],
  cvd: -18,
});
if (unlabeledDoesNotSell.signal !== "WAIT") {
  throw new Error("unlabeled wallet-to-wallet size must not fire SELL");
}

const smallWall = decideM1Confluence({
  flow: { ...emptyFlow, outflows: 540, netflow: -540 },
  live: 64020,
  bar: bar({ high: 64100, low: 63990, close: 64020 }),
  askWalls: [],
  bidWalls: [wall("bid", 64000, 120, false)],
  cvd: 15,
});
if (smallWall.signal !== "WAIT") {
  throw new Error("notable <500 BTC wall must not fire");
}

const plan = buildWallPlan("BUY", 64_200, wall("bid", 64_000, 800));
if (!plan) throw new Error("buy plan");
if (plan.entry !== 64_200) throw new Error("entry is Global VWAP");
if (plan.stop >= plan.entry) throw new Error("BUY stop must be below entry");
if (Math.abs(plan.takeProfit - (64_200 + 3 * (64_200 - plan.stop))) > 0.05) {
  throw new Error(`1:3 TP mismatch ${plan.takeProfit}`);
}
if (plan.riskUsd !== 10) throw new Error("1% of 1000 is 10");
if (Math.abs(plan.sizeBtc * (plan.entry - plan.stop) - 10) > 0.05) {
  throw new Error(`size must risk ~$10, got ${plan.sizeBtc * (plan.entry - plan.stop)}`);
}

const sellPlan = buildWallPlan("SELL", 65_000, wall("ask", 65_200, 700));
if (!sellPlan) throw new Error("sell plan");
if (sellPlan.stop <= sellPlan.entry) throw new Error("SELL stop must be above wall");
if (Math.abs(sellPlan.takeProfit - (65_000 - 3 * (sellPlan.stop - 65_000))) > 0.05) {
  throw new Error(`sell TP ${sellPlan.takeProfit}`);
}

const puBuy = toPuPrimePlan(plan);
if (!puBuy) throw new Error("pu prime buy plan");
if (puBuy.entry !== plan.entry - PU_PRIME_GAP_USD) {
  throw new Error(`PU Prime entry should be exchange − $${PU_PRIME_GAP_USD}, got ${puBuy.entry}`);
}
if (puBuy.stop !== plan.stop - PU_PRIME_GAP_USD - PU_PRIME_SPREAD_USD) {
  throw new Error(`PU Prime BUY stop should pad $${PU_PRIME_SPREAD_USD} spread, got ${puBuy.stop}`);
}
if (puBuy.riskUsd !== 10) throw new Error("PU Prime max risk must stay $10");
if (Math.abs(puBuy.sizeLots * (puBuy.entry - puBuy.stop) - 10) > 0.6) {
  throw new Error(`lots should risk ~$10, got ${puBuy.sizeLots * (puBuy.entry - puBuy.stop)}`);
}
if (lotsGuide(0.04) !== "Use 0.04 Lots") throw new Error(lotsGuide(0.04));
if (puPrimeQuote(80_915.18) !== 80_785.18) {
  throw new Error(`gap quote ${puPrimeQuote(80_915.18)}`);
}

const puSell = toPuPrimePlan(sellPlan);
if (!puSell) throw new Error("pu prime sell plan");
if (puSell.stop !== sellPlan.stop - PU_PRIME_GAP_USD + PU_PRIME_SPREAD_USD) {
  throw new Error(`PU Prime SELL stop ${puSell.stop}`);
}

if (
  wallStillReal(wall("ask", 65000, 600), [wall("ask", 65020, 500)]) === false
) {
  throw new Error("wall that kept 83% size should still be real");
}
if (wallStillReal(wall("ask", 65000, 600), [wall("ask", 65020, 200)])) {
  throw new Error("spoofed wall that shrank should fail");
}

const bars = [
  bar({ buyVolume: 10, sellVolume: 4, close: 1 }),
  bar({ buyVolume: 3, sellVolume: 9, close: 1 }),
];
if (cvdFromBars(bars) !== 0) throw new Error(`cvd ${cvdFromBars(bars)}`);

if (!shouldFireM1Alert("SELL", 100, null)) {
  throw new Error("first SELL on a candle must fire");
}
if (!shouldFireM1Alert("BUY", 100, null)) {
  throw new Error("first BUY on a candle must fire");
}
if (shouldFireM1Alert("SELL", 100, 100)) {
  throw new Error("duplicate on same M1 candle must not fire");
}
if (shouldFireM1Alert("WAIT", 100, null)) {
  throw new Error("WAIT must not email");
}
if (!shouldFireM1Alert("BUY", 101, 100)) {
  throw new Error("next M1 candle may fire again");
}

resetAlertLatch(null);
const mail = formatM1Email(plan, {
  ok: true,
  error: null,
  timeframe: "1m",
  candleKey: 100,
  live_price: 64_210,
  live_vwap: 64_200,
  cvd: 12,
  cvdLabel: "buying delta",
  signal: "BUY",
  recommendation: "test",
  spoofChecked: true,
  spoofCleared: true,
  armedPlan: plan,
  puPrimePlan: toPuPrimePlan(plan),
  walls: [],
  askWalls: [],
  bidWalls: [],
  bars: [],
  flow: {
    ...emptyOnchainFlow(),
    outflows: 540,
    netflow: -540,
    unlabeled: 197,
    pendingBtc: 40,
    confirmedBtc: 500,
    watchedWallets: TRACKED_EXCHANGE_ADDRESSES.length,
    esploraSource: "Mempool.space",
  },
  venues: [],
  scannedAt: "2026-09-18T00:00:00.000Z",
  source: "binance + coinbase + kraken",
});
if (mail.subject !== M1_ALERT_SUBJECT) {
  throw new Error(`subject ${mail.subject}`);
}
if (!mail.subject.includes("[HIGH-CONFIDENCE CONFLUENCE] M1 Whale Signal Alert")) {
  throw new Error("exact alert title");
}
if (!mail.text.includes("Entry (Global VWAP at trigger)")) {
  throw new Error("entry line");
}
if (!mail.text.includes("Take Profit (1:3 R:R)")) throw new Error("tp line");
if (!mail.text.includes("Stop (other side of whale wall)")) {
  throw new Error("sl line");
}
if (!mail.text.includes("Exchange Levels (Binance/Coinbase Data)")) {
  throw new Error("exchange book label");
}
if (!mail.text.includes("PuPrime Levels (MT4/MT5 Guide)")) {
  throw new Error("puprime book label");
}
if (!mail.text.includes("Lots")) throw new Error("lots in email");
if (!mail.text.includes("Unlabeled (wallet↔wallet)")) {
  throw new Error("email must report unlabeled flow");
}
if (!mail.text.includes("Pending mempool")) {
  throw new Error("email must report pending BTC");
}

const enKeys = Object.keys(dictionaries.en);
const filKeys = Object.keys(dictionaries.fil);
if (enKeys.join(",") !== filKeys.join(",")) {
  throw new Error("EN/FIL i18n keys must stay in lockstep");
}

if (TAPE_BTC !== 10) throw new Error(`tape floor ${TAPE_BTC}`);
if (WHALE_BTC !== 500) throw new Error(`whale ${WHALE_BTC}`);
if (TRACKED_EXCHANGE_ADDRESSES.length < 20) {
  throw new Error(`expected full exchange cluster list, got ${TRACKED_EXCHANGE_ADDRESSES.length}`);
}

const bases = esploraBases();
if (!bases.some((base) => base.includes("mempool.space"))) {
  throw new Error("Mempool.space must be an Esplora base");
}
if (!bases.some((base) => base.includes("blockstream.info"))) {
  throw new Error("Blockstream must be the Esplora fallback");
}

const pendingTx = {
  txid: "x",
  vin: [],
  vout: [],
  status: { confirmed: false },
};
if (confirmationsFor(pendingTx, 900_000) !== 0) {
  throw new Error("unconfirmed tx must have 0 confirmations");
}
const mined = {
  ...pendingTx,
  status: { confirmed: true, block_height: 900_000 },
};
if (confirmationsFor(mined, 900_002) !== 3) {
  throw new Error(`confs ${confirmationsFor(mined, 900_002)}`);
}

const nextBlock = estimateArrival(40, {
  fastestFee: 20,
  halfHourFee: 10,
  hourFee: 5,
  source: "test",
}, false);
if (nextBlock.label !== "~10 min (next block)") {
  throw new Error(`eta ${nextBlock.label}`);
}
if (estimateArrival(1, {
  fastestFee: 20,
  halfHourFee: 10,
  hourFee: 5,
  source: "test",
}, true).label !== "in a block") {
  throw new Error("confirmed ETA");
}

if (!isDiscordWebhookUrl("https://discord.com/api/webhooks/1/abc")) {
  throw new Error("valid discord webhook rejected");
}
if (isDiscordWebhookUrl("https://example.com/api/webhooks/1/abc")) {
  throw new Error("non-discord webhook must be rejected");
}

const prevWebhook = process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_WEBHOOK_URL;
const recent = mempoolUrl("/mempool/recent");
if (!recent.startsWith("https://mempool.space/api/mempool/recent")) {
  throw new Error(`expected absolute mempool URL, got ${recent}`);
}

console.log("sell", sell.signal, sell.recommendation);
console.log(
  "buy plan",
  plan.entry,
  "→",
  plan.takeProfit,
  "stop",
  plan.stop,
  "size",
  plan.sizeBtc
);

void sendDiscordAlert(plan, {
  ok: true,
  error: null,
  timeframe: "1m",
  candleKey: 100,
  live_price: 64_210,
  live_vwap: 64_200,
  cvd: 12,
  cvdLabel: "buying delta",
  signal: "BUY",
  recommendation: "test",
  spoofChecked: true,
  spoofCleared: true,
  armedPlan: plan,
  puPrimePlan: toPuPrimePlan(plan),
  walls: [],
  askWalls: [],
  bidWalls: [],
  bars: [],
  flow: emptyOnchainFlow(),
  venues: [],
  scannedAt: "2026-09-18T00:00:00.000Z",
  source: "binance + coinbase + kraken",
}).then((discordSkip) => {
  if (discordSkip.status !== "skipped") {
    throw new Error(`discord without webhook should skip, got ${discordSkip.status}`);
  }
  if (prevWebhook) process.env.DISCORD_WEBHOOK_URL = prevWebhook;
  console.log("ok");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
