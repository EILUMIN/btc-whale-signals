import {
  BASIS_UNAVAILABLE_NOTE,
  computeBasis,
  formatBasisDisplay,
  parseInstrument,
  type BasisQuote,
} from "../src/lib/basis";
import { fetchFuturesSnapshot } from "../src/lib/futures";

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function quote(
  partial: Partial<BasisQuote> & Pick<BasisQuote, "kind">
): BasisQuote {
  return {
    venue: partial.venue ?? "okx",
    instrument:
      partial.instrument ??
      (partial.kind === "futures" ? "BTC-USDT-SWAP" : "BTC-USDT"),
    price: partial.price ?? null,
    timestamp: partial.timestamp ?? iso(Date.now()),
    kind: partial.kind,
  };
}

const now = Date.parse("2026-09-20T12:00:00.000Z");

function assert(cond: unknown, message: string | null | undefined): asserts cond {
  if (!cond) throw new Error(message || "assertion failed");
}

// Valid basis calculation
const valid = computeBasis({
  futures: quote({ kind: "futures", price: 80_890.1, timestamp: iso(now) }),
  index: quote({ kind: "index", price: 80_934.2, timestamp: iso(now) }),
  nowMs: now,
  staleLimitSec: 60,
});
assert(valid.available, `valid basis unavailable: ${valid.reason}`);
assert(valid.basis !== null && Math.abs(valid.basis - (80_890.1 - 80_934.2)) < 1e-9, `basis ${valid.basis}`);
assert(
  valid.basisPct !== null &&
    Math.abs(valid.basisPct - (80_890.1 - 80_934.2) / 80_934.2) < 1e-12,
  `basisPct ${valid.basisPct}`
);
assert(valid.source === "okx · BTC-USDT-SWAP vs BTC-USDT (index)", valid.source);
assert(valid.futuresInstrument === "BTC-USDT-SWAP", "futures instrument");
assert(valid.spotInstrument === "BTC-USDT", "index instrument");
assert(valid.status === "fresh", `status ${valid.status}`);
assert(valid.stale === false, "valid print must be fresh");

// Positive basis
const contango = computeBasis({
  futures: quote({ kind: "futures", price: 81_000, timestamp: iso(now) }),
  index: quote({ kind: "index", price: 80_000, timestamp: iso(now) }),
  nowMs: now,
});
assert(contango.available && contango.basis === 1_000, `positive basis ${contango.basis}`);
assert(contango.basisPct === 1_000 / 80_000, `positive pct ${contango.basisPct}`);
assert(formatBasisDisplay(contango.basis!, contango.basisPct!).startsWith("+$"), formatBasisDisplay(contango.basis!, contango.basisPct!));
assert(contango.basis! > 0, "positive basis must be > 0");

// Negative basis
const backward = computeBasis({
  futures: quote({ kind: "futures", price: 79_000, timestamp: iso(now) }),
  spot: quote({ kind: "spot", price: 80_000, timestamp: iso(now) }),
  nowMs: now,
});
assert(backward.available && backward.basis === -1_000, `negative basis ${backward.basis}`);
assert(backward.basisPct === -1_000 / 80_000, `negative pct ${backward.basisPct}`);
assert(backward.spotKind === "spot", "spot fallback");
assert(backward.basis! < 0, "negative basis must be < 0");

// Missing spot/index price
const missingSpot = computeBasis({
  futures: quote({ kind: "futures", price: 80_000, timestamp: iso(now) }),
  nowMs: now,
});
assert(!missingSpot.available, "missing spot must be unavailable");
assert(missingSpot.reason === "missing spot/index price", missingSpot.reason);
assert(missingSpot.basis === null && missingSpot.basisPct === null, "no fake zero for missing spot");
assert(missingSpot.status === "unavailable", missingSpot.status);

// Missing futures price
const missingFutures = computeBasis({
  index: quote({ kind: "index", price: 80_000, timestamp: iso(now) }),
  nowMs: now,
});
assert(!missingFutures.available, "missing futures must be unavailable");
assert(missingFutures.reason === "missing futures price", missingFutures.reason);
assert(missingFutures.basis === null, "no fake zero for missing futures");

const zeroFutures = computeBasis({
  futures: quote({ kind: "futures", price: 0, timestamp: iso(now) }),
  index: quote({ kind: "index", price: 80_000, timestamp: iso(now) }),
  nowMs: now,
});
assert(zeroFutures.reason === "invalid futures price", zeroFutures.reason);
assert(zeroFutures.basis === null, "zero futures price is not a real basis");

// Stale data — still computed, marked stale, not used as confirmation
const stale = computeBasis({
  futures: quote({ kind: "futures", price: 80_100, timestamp: iso(now - 180_000) }),
  index: quote({ kind: "index", price: 80_000, timestamp: iso(now - 180_000) }),
  nowMs: now,
  staleLimitSec: 60,
});
assert(stale.available, `stale pair should still calculate: ${stale.reason}`);
assert(stale.basis === 100, `stale basis ${stale.basis}`);
assert(stale.stale, "stale flag");
assert(stale.status === "stale", stale.status);

// Mismatched timestamps
const skew = computeBasis({
  futures: quote({ kind: "futures", price: 80_100, timestamp: iso(now) }),
  index: quote({ kind: "index", price: 80_000, timestamp: iso(now - 45_000) }),
  nowMs: now,
  maxSkewMs: 30_000,
});
assert(!skew.available, "timestamp skew must be unavailable");
assert(skew.reason === "mismatched timestamps", skew.reason);
assert(skew.basis === null, "no mixed-time fallback value");

// Wrong / mismatched instruments
const eth = computeBasis({
  futures: quote({ kind: "futures", price: 80_100, timestamp: iso(now) }),
  index: quote({
    kind: "index",
    instrument: "ETH-USDT",
    price: 4_000,
    timestamp: iso(now),
  }),
  nowMs: now,
});
assert(!eth.available, "ETH index must not pair with BTC futures");
assert(eth.reason === "mismatched instruments", eth.reason);
assert(eth.basis === null, "no cross-asset basis");

const usdQuote = computeBasis({
  futures: quote({ kind: "futures", price: 80_100, timestamp: iso(now) }),
  index: quote({
    kind: "index",
    instrument: "BTC-USD",
    price: 80_000,
    timestamp: iso(now),
  }),
  nowMs: now,
});
assert(usdQuote.reason === "mismatched instruments", usdQuote.reason);

const venues = computeBasis({
  futures: quote({
    kind: "futures",
    venue: "okx",
    price: 80_100,
    timestamp: iso(now),
  }),
  index: quote({
    kind: "index",
    venue: "binance",
    instrument: "BTCUSDT",
    price: 80_000,
    timestamp: iso(now),
  }),
  nowMs: now,
});
assert(venues.reason === "mismatched venues", venues.reason);
assert(venues.basis === null, "no cross-exchange basis");

assert(parseInstrument("BTC-USDT-SWAP")?.key === "BTC-USDT", "parse swap");
assert(parseInstrument("BTC-USDT")?.key === "BTC-USDT", "parse index/spot");
assert(parseInstrument("ETH-USDT") === null, "reject ETH");
assert(BASIS_UNAVAILABLE_NOTE === "BASIS UNAVAILABLE — optional confirmation missing.", "note");

async function livePublicPair() {
  const live = await fetchFuturesSnapshot();
  if (!live.basisAvailable || live.basis === null || live.basisPct === null) {
    throw new Error(`live public basis unavailable: ${live.basisReason}`);
  }
  if (!live.basisSource?.includes("okx") && !live.basisSource?.includes("binance")) {
    throw new Error(`unexpected live basis source ${live.basisSource}`);
  }
  const expectedPct =
    live.spotIndexPrice && live.spotIndexPrice > 0 && live.basis !== null
      ? live.basis / live.spotIndexPrice
      : null;
  if (
    expectedPct === null ||
    live.basisPct === null ||
    Math.abs(live.basisPct - expectedPct) > 1e-10
  ) {
    throw new Error(`live basis% ${live.basisPct} != ${expectedPct}`);
  }
  return live;
}

livePublicPair()
  .then((live) => {
    console.log("basis ok", {
      unit: {
        valid: formatBasisDisplay(valid.basis!, valid.basisPct!),
        positive: formatBasisDisplay(contango.basis!, contango.basisPct!),
        negative: formatBasisDisplay(backward.basis!, backward.basisPct!),
        missingSpot: missingSpot.reason,
        missingFutures: missingFutures.reason,
        stale: stale.status,
        mismatchedTs: skew.reason,
        mismatchedInst: eth.reason,
      },
      live: {
        source: live.basisSource,
        futuresInstrument: live.futuresInstrument,
        spotInstrument: live.spotInstrument,
        futuresPrice: live.futuresPrice,
        spotIndexPrice: live.spotIndexPrice,
        basis: live.basis,
        basisPct: live.basisPct,
        status: live.basisStatus,
      },
    });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
