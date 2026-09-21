import { decideM1Confluence, emptyOnchainFlow, type WhaleWall } from "../src/lib/m1";
import { decidePrecisionSetup } from "../src/lib/precision";
import { emptyFutures, type FuturesSnapshot } from "../src/lib/futures";
import {
  WallStatusBook,
  priceInDisplayedWallRange,
} from "../src/lib/wall-status";
import { loadRiskSettings } from "../src/lib/risk-settings";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function wall(partial: Partial<WhaleWall> & Pick<WhaleWall, "side" | "price">): WhaleWall {
  const price = partial.price;
  return {
    side: partial.side,
    price,
    priceLow: partial.priceLow ?? price - 20,
    priceHigh: partial.priceHigh ?? price + 20,
    btc: partial.btc ?? 560,
    venues: partial.venues ?? ["binance"],
    whale: (partial.btc ?? 560) >= 500,
    status: partial.status,
    hit: partial.hit,
  };
}

const now = Date.parse("2026-09-21T01:44:00.000Z");
const ask = wall({
  side: "ask",
  price: 80_120,
  priceLow: 80_100,
  priceHigh: 80_140,
  btc: 560,
  venues: ["coinbase"],
});
const bid = wall({
  side: "bid",
  price: 79_880,
  priceLow: 79_860,
  priceHigh: 79_900,
  btc: 610,
  venues: ["kraken"],
});

assert(!priceInDisplayedWallRange(80_099.99, ask), "below displayed ask range is not HIT");
assert(priceInDisplayedWallRange(80_100, ask), "ask low bound is HIT");
assert(priceInDisplayedWallRange(80_140, ask), "ask high bound is HIT");
assert(!priceInDisplayedWallRange(80_140.01, ask), "above displayed ask range is not HIT");

const book = new WallStatusBook();

const approaching = book.observe({ walls: [ask], live: 80_050, nowMs: now });
assert(approaching[0].status === "APPROACHING", `approach ${approaching[0].status}`);
assert(!approaching[0].hit, "no hit record before the range");

const hit = book.observe({ walls: [ask], live: 80_110, nowMs: now + 1_000 });
assert(hit[0].status === "HIT", `hit ${hit[0].status}`);
assert(hit[0].hit, "HIT must record a print");
assert(hit[0].hit?.timestamp === new Date(now + 1_000).toISOString(), "hit timestamp");
assert(hit[0].hit?.price === 80_110, "hit price");
assert(hit[0].hit?.exchange === "coinbase", "hit exchange");
assert(hit[0].hit?.side === "ask", "hit side");
assert(hit[0].hit?.btc === 560, "hit size");

const stillHit = book.observe({ walls: [ask], live: 80_125, nowMs: now + 2_000 });
assert(stillHit[0].status === "HIT", "stay HIT while inside the range");
assert(stillHit[0].hit?.timestamp === hit[0].hit?.timestamp, "do not rewrite the first hit");

const rejected = book.observe({ walls: [ask], live: 80_050, nowMs: now + 3_000 });
assert(rejected[0].status === "REJECTED", `rejected ${rejected[0].status}`);
assert(rejected[0].hit?.price === 80_110, "rejected keeps the hit print");

const brokenBook = new WallStatusBook();
brokenBook.observe({ walls: [ask], live: 80_110, nowMs: now });
const broken = brokenBook.observe({ walls: [ask], live: 80_200, nowMs: now + 1_000 });
assert(broken[0].status === "BROKEN", `broken through ${broken[0].status}`);

const persistBook = new WallStatusBook();
persistBook.observe({ walls: [ask], live: 80_110, nowMs: now });
const vanished = persistBook.observe({ walls: [], live: 80_110, nowMs: now + 1_000 });
assert(vanished[0].status === "BROKEN", "HIT then missing wall is BROKEN");
assert(vanished[0].hit?.btc === 560, "broken keeps hit size");

const shrinkBook = new WallStatusBook();
shrinkBook.observe({ walls: [ask], live: 80_110, nowMs: now });
const shrunk = shrinkBook.observe({
  walls: [{ ...ask, btc: 100 }],
  live: 80_050,
  nowMs: now + 1_000,
});
assert(shrunk[0].status === "BROKEN", "HIT then size fails is BROKEN");

const removedBook = new WallStatusBook();
removedBook.observe({ walls: [ask], live: 80_050, nowMs: now });
const removed = removedBook.observe({ walls: [], live: 80_050, nowMs: now + 1_000 });
assert(removed[0].status === "REMOVED", `removed ${removed[0].status}`);
assert(!removed[0].hit, "removed before HIT has no hit print");

const bidBook = new WallStatusBook();
bidBook.observe({ walls: [bid], live: 79_950, nowMs: now });
const bidHit = bidBook.observe({ walls: [bid], live: 79_880, nowMs: now + 500 });
assert(bidHit[0].status === "HIT", "bid HIT");
assert(bidHit[0].hit?.exchange === "kraken", "bid exchange");
const bidRejected = bidBook.observe({ walls: [bid], live: 79_950, nowMs: now + 1_000 });
assert(bidRejected[0].status === "REJECTED", "bid bounce is REJECTED");
const bidBreakBook = new WallStatusBook();
bidBreakBook.observe({ walls: [bid], live: 79_880, nowMs: now });
const bidBroken = bidBreakBook.observe({ walls: [bid], live: 79_800, nowMs: now + 1_000 });
assert(bidBroken[0].status === "BROKEN", "bid through is BROKEN");

const wait = decideM1Confluence({
  flow: emptyOnchainFlow(),
  live: 80_110,
  bar: {
    time: 1,
    open: 80_100,
    high: 80_130,
    low: 80_090,
    close: 80_110,
    volume: 10,
    buyVolume: 4,
    sellVolume: 6,
  },
  askWalls: [{ ...ask, status: "HIT", hit: hit[0].hit }],
  bidWalls: [],
  cvd: -12,
});
assert(wait.signal === "WAIT", `HIT alone must not SELL, got ${wait.signal}`);

const settings = loadRiskSettings();
const bars = Array.from({ length: 20 }, (_, i) => ({
  time: i,
  open: 80_100,
  high: 80_130,
  low: 80_090,
  close: 80_110,
  volume: 10,
  buyVolume: 8,
  sellVolume: 2,
}));
const freshFutures = (): FuturesSnapshot => ({
  ...emptyFutures("ok"),
  ok: true,
  stale: false,
  missingCore: false,
  waitReason: null,
  futuresPrice: 80_110,
  openInterest: 90_000,
  openInterestPrev: 91_000,
  oiRising: false,
  fundingRate: 0.0001,
  takerBuy: 1_400,
  takerSell: 900,
  takerBuyDominant: true,
});
const hitOnly = decidePrecisionSetup({
  live: 80_110,
  vwap: 80_050,
  cvd: 18,
  bars,
  bidWalls: [{ ...bid, status: "HIT" }],
  askWalls: [{ ...ask, status: "HIT" }],
  flow: emptyOnchainFlow(),
  futures: freshFutures(),
  priceTimestamp: new Date(now).toISOString(),
  spoofChecked: true,
  spoofCleared: true,
  venuesOk: 3,
  settings,
  nowMs: now,
});
assert(hitOnly.direction === "WAIT", `HIT alone must not LONG/SHORT, got ${hitOnly.direction}`);

console.log("wall-status ok", {
  approaching: approaching[0].status,
  hit: {
    status: hit[0].status,
    price: hit[0].hit?.price,
    exchange: hit[0].hit?.exchange,
    side: hit[0].hit?.side,
    btc: hit[0].hit?.btc,
  },
  rejected: rejected[0].status,
  broken: broken[0].status,
  removed: removed[0].status,
  precision: hitOnly.direction,
});
