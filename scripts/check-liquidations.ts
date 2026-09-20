import {
  OKX_BTC_USDT_SWAP_CTVAL,
  emptyLiquidations,
  parseOkxLiquidations,
} from "../src/lib/liquidations";
import { fetchFuturesSnapshot } from "../src/lib/futures";

function assert(cond: unknown, message: string | null | undefined): asserts cond {
  if (!cond) throw new Error(message || "assertion failed");
}

const now = Date.parse("2026-09-20T21:30:00.000Z");
const ts = String(now);

function group(details: unknown) {
  return {
    instId: "BTC-USDT-SWAP",
    uly: "BTC-USDT",
    details,
  };
}

function detail(partial: {
  side?: string;
  posSide?: string;
  sz?: string;
  bkPx?: string;
}) {
  return {
    side: partial.side ?? "sell",
    posSide: partial.posSide ?? "long",
    sz: partial.sz ?? "1",
    bkPx: partial.bkPx ?? "80000",
    ts,
  };
}

// Real zero liquidation events
const zero = parseOkxLiquidations(
  { code: "0", msg: "", data: [] },
  { fetchedAt: new Date(now).toISOString(), nowMs: now }
);
assert(zero.available, `zero should be available: ${zero.reason}`);
assert(zero.eventCount === 0, `zero count ${zero.eventCount}`);
assert(zero.longUsd === 0 && zero.shortUsd === 0, "real zero amounts");
assert(zero.displayLong.includes("No liquidation events"), zero.displayLong);
assert(zero.displayLong.includes("$0.00"), zero.displayLong);
assert(zero.status === "fresh", zero.status);

const zeroDetails = parseOkxLiquidations(
  { code: "0", data: [group([])] },
  { fetchedAt: new Date(now).toISOString(), nowMs: now }
);
assert(zeroDetails.available && zeroDetails.eventCount === 0, "empty details is real zero");

// One long liquidation event
const oneLong = parseOkxLiquidations(
  { code: "0", data: [group([detail({ posSide: "long", side: "sell", sz: "1", bkPx: "80000" })])] },
  { fetchedAt: new Date(now).toISOString(), nowMs: now }
);
assert(oneLong.available, oneLong.reason);
assert(oneLong.longCount === 1 && oneLong.shortCount === 0, "one long");
assert(oneLong.longUsd === 1 * OKX_BTC_USDT_SWAP_CTVAL * 80_000, `long usd ${oneLong.longUsd}`);
assert(oneLong.shortUsd === 0, "short side real zero inside a valid print");
assert(oneLong.displayLong.includes("$800"), oneLong.displayLong);
assert(!oneLong.displayLong.includes("No liquidation events"), "populated print is not an empty window");

// One short liquidation event
const oneShort = parseOkxLiquidations(
  { code: "0", data: [group([detail({ posSide: "short", side: "buy", sz: "2", bkPx: "80000" })])] },
  { fetchedAt: new Date(now).toISOString(), nowMs: now }
);
assert(oneShort.shortCount === 1 && oneShort.longCount === 0, "one short");
assert(oneShort.shortUsd === 2 * OKX_BTC_USDT_SWAP_CTVAL * 80_000, `short usd ${oneShort.shortUsd}`);
assert(oneShort.longUsd === 0, "long side real zero inside a valid print");

// Both long and short events
const both = parseOkxLiquidations(
  {
    code: "0",
    data: [
      group([
        detail({ posSide: "long", side: "sell", sz: "1", bkPx: "80000" }),
        detail({ posSide: "short", side: "buy", sz: "2", bkPx: "80000" }),
      ]),
    ],
  },
  { fetchedAt: new Date(now).toISOString(), nowMs: now }
);
assert(both.eventCount === 2 && both.longCount === 1 && both.shortCount === 1, "both sides");
assert(both.longUsd === 800 && both.shortUsd === 1_600, `both usd ${both.longUsd} ${both.shortUsd}`);
assert(both.detail?.includes("2 events"), both.detail);

// Empty response
const empty = parseOkxLiquidations(
  { code: "0", data: [] },
  { fetchedAt: new Date(now).toISOString(), nowMs: now }
);
assert(empty.available && empty.eventCount === 0, "empty array is a valid zero window");
assert(empty.displayShort === "$0.00 · No liquidation events", empty.displayShort);

// Null response — not a real zero
const nulled = parseOkxLiquidations(null, { nowMs: now });
assert(!nulled.available, "null is unavailable");
assert(nulled.reason === "null response", nulled.reason);
assert(nulled.longUsd === null && nulled.shortUsd === null, "null must not become $0");
assert(nulled.displayLong === "Unavailable", nulled.displayLong);

const missingData = parseOkxLiquidations({ code: "0" }, { nowMs: now });
assert(missingData.reason === "missing liquidation data", missingData.reason);
assert(missingData.longUsd === null, "missing data is not zero");

// API error
const apiError = parseOkxLiquidations(
  { code: "50011", msg: "Invalid instType" },
  { nowMs: now, httpStatus: 200 }
);
assert(!apiError.available, "API error unavailable");
assert(apiError.reason === "API error 50011: Invalid instType", apiError.reason);
assert(apiError.displayLong === "Unavailable", apiError.displayLong);
assert(apiError.longUsd === null, "API error must not display $0.00");

// Stale response
const stale = parseOkxLiquidations(
  { code: "0", data: [group([detail({})])] },
  {
    fetchedAt: new Date(now - 10 * 60_000).toISOString(),
    nowMs: now,
    staleLimitSec: 60,
  }
);
assert(stale.available, "stale still parsed");
assert(stale.stale && stale.status === "stale", stale.status);
assert(stale.displayLong === "Data stale", stale.displayLong);
assert(stale.eventCount === 1, "stale keeps the event count");

// Invalid response format
const badShape = parseOkxLiquidations({ code: "0", data: { foo: 1 } as never }, { nowMs: now });
assert(badShape.reason === "invalid response format", badShape.reason);
assert(badShape.displayShort === "Unavailable", badShape.displayShort);
assert(badShape.longUsd === null, "malformed is not zero");

const missingDetails = parseOkxLiquidations(
  { code: "0", data: [{ instId: "BTC-USDT-SWAP", uly: "BTC-USDT" }] },
  { nowMs: now }
);
assert(missingDetails.reason === "invalid response format", missingDetails.reason);

const wrapperAsEvent = parseOkxLiquidations(
  {
    code: "0",
    data: [{ instId: "BTC-USDT-SWAP", uly: "BTC-USDT", details: "not-an-array" }],
  },
  { nowMs: now }
);
assert(wrapperAsEvent.reason === "invalid response format", wrapperAsEvent.reason);
assert(wrapperAsEvent.longUsd === null, "wrapper without details is not $0");

const eth = parseOkxLiquidations(
  { code: "0", data: [{ instId: "ETH-USDT-SWAP", uly: "ETH-USDT", details: [detail({})] }] },
  { nowMs: now }
);
assert(eth.reason === "mismatched instruments", eth.reason);

assert(emptyLiquidations("source missing").displayLong === "Unavailable", "empty helper");

async function livePublicLiq() {
  const live = await fetchFuturesSnapshot();
  if (!live.liqAvailable || live.liqEventCount === null) {
    throw new Error(
      `live OKX liquidations unavailable: status=${live.liqHttpStatus} reason=${live.liqReason}`
    );
  }
  if (live.longLiquidations === null || live.shortLiquidations === null) {
    throw new Error("live available print must keep numeric sides, including real zeros");
  }
  return live;
}

livePublicLiq()
  .then((live) => {
    console.log("liquidations ok", {
      unit: {
        zero: zero.displayLong,
        oneLong: { usd: oneLong.longUsd, display: oneLong.displayLong },
        oneShort: { usd: oneShort.shortUsd, display: oneShort.displayShort },
        both: both.detail,
        empty: empty.reason,
        nulled: nulled.reason,
        apiError: apiError.reason,
        stale: stale.displayLong,
        invalid: badShape.reason,
      },
      live: {
        httpStatus: live.liqHttpStatus,
        source: live.liqSource,
        eventCount: live.liqEventCount,
        longCount: live.liqLongCount,
        shortCount: live.liqShortCount,
        longUsd: live.longLiquidations,
        shortUsd: live.shortLiquidations,
        status: live.liqStatus,
        reason: live.liqReason,
      },
    });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
