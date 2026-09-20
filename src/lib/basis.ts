import { ageSeconds, isStale } from "@/lib/format";

export const OKX_FUTURES_INSTRUMENT = "BTC-USDT-SWAP";
export const OKX_INDEX_INSTRUMENT = "BTC-USDT";
export const OKX_SPOT_INSTRUMENT = "BTC-USDT";
export const BINANCE_USDT_PERP = "BTCUSDT";

export const BASIS_MAX_SKEW_MS = 30_000;
export const BASIS_UNAVAILABLE_NOTE =
  "BASIS UNAVAILABLE — optional confirmation missing.";

export type BasisKind = "futures" | "index" | "spot";
export type BasisStatus = "fresh" | "stale" | "unavailable";

export type BasisQuote = {
  venue: string;
  instrument: string;
  price: number | null;
  timestamp: string | null;
  kind: BasisKind;
};

export type ParsedInstrument = {
  base: string;
  quote: string;
  style: "swap" | "spot" | "index" | "unknown";
  key: string;
};

export type BasisResult = {
  available: boolean;
  reason: string | null;
  basis: number | null;
  basisPct: number | null;
  futuresPrice: number | null;
  spotIndexPrice: number | null;
  spotKind: "index" | "spot" | null;
  source: string | null;
  futuresInstrument: string | null;
  spotInstrument: string | null;
  timestamp: string | null;
  ageSec: number | null;
  stale: boolean;
  status: BasisStatus;
};

export function emptyBasisResult(reason: string): BasisResult {
  return {
    available: false,
    reason,
    basis: null,
    basisPct: null,
    futuresPrice: null,
    spotIndexPrice: null,
    spotKind: null,
    source: null,
    futuresInstrument: null,
    spotInstrument: null,
    timestamp: null,
    ageSec: null,
    stale: false,
    status: "unavailable",
  };
}

export function parseInstrument(raw: string | null | undefined): ParsedInstrument | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/[_/]/g, "-");
  const dashed = s.match(
    /^(BTC)-(USDT)(?:-(SWAP|PERP|FUTURES|INDEX))?$/
  );
  if (dashed) {
    const style =
      dashed[3] === "INDEX"
        ? "index"
        : dashed[3]
          ? "swap"
          : "spot";
    return { base: "BTC", quote: "USDT", style, key: "BTC-USDT" };
  }
  if (s === "BTCUSDT") {
    return { base: "BTC", quote: "USDT", style: "spot", key: "BTC-USDT" };
  }
  if (s === "BTCUSDTPERP" || s === "BTCUSDT-PERP") {
    return { base: "BTC", quote: "USDT", style: "swap", key: "BTC-USDT" };
  }
  return null;
}

function venueKey(venue: string | null | undefined) {
  return (venue ?? "").trim().toLowerCase();
}

function finitePrice(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function pairCheck(
  futures: BasisQuote,
  ref: BasisQuote
): { ok: true } | { ok: false; reason: string } {
  if (venueKey(futures.venue) !== venueKey(ref.venue)) {
    return { ok: false, reason: "mismatched venues" };
  }
  const futInst = parseInstrument(futures.instrument);
  const refInst = parseInstrument(ref.instrument);
  if (!futInst || !refInst || futInst.key !== refInst.key) {
    return { ok: false, reason: "mismatched instruments" };
  }
  if (futInst.base !== "BTC" || refInst.base !== "BTC") {
    return { ok: false, reason: "mismatched instruments" };
  }
  if (futInst.quote !== refInst.quote) {
    return { ok: false, reason: "mismatched instruments" };
  }
  return { ok: true };
}

function pickReference(
  futures: BasisQuote,
  index: BasisQuote | null | undefined,
  spot: BasisQuote | null | undefined
):
  | { ok: true; ref: BasisQuote }
  | { ok: false; reason: string } {
  const indexPresent = Boolean(index);
  if (indexPresent) {
    if (!finitePrice(index!.price) || index!.price! <= 0) {
      if (!spot) return { ok: false, reason: "invalid spot/index price" };
    } else {
      const check = pairCheck(futures, index!);
      if (check.ok) return { ok: true, ref: index! };
      return check;
    }
  }
  if (spot) {
    if (!finitePrice(spot.price) || spot.price <= 0) {
      return { ok: false, reason: "invalid spot/index price" };
    }
    const check = pairCheck(futures, spot);
    if (check.ok) return { ok: true, ref: spot };
    return check;
  }
  return { ok: false, reason: "missing spot/index price" };
}

function sourceLabel(futures: BasisQuote, ref: BasisQuote) {
  const kind = ref.kind === "spot" ? "spot" : "index";
  const venue = venueKey(futures.venue);
  return `${venue} · ${futures.instrument} vs ${ref.instrument} (${kind})`;
}

export function formatBasisAmount(basis: number): string {
  const money = Math.abs(basis).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (basis > 0) return `+${money}`;
  if (basis < 0) return `-${money}`;
  return money;
}

export function formatBasisPct(basisPct: number): string {
  const pct = basisPct * 100;
  if (pct > 0) return `+${pct.toFixed(4)}%`;
  return `${pct.toFixed(4)}%`;
}

export function formatBasisDisplay(basis: number, basisPct: number): string {
  return `${formatBasisAmount(basis)} (${formatBasisPct(basisPct)})`;
}

export function isBasisUsable(input: {
  basisAvailable?: boolean;
  basisStale?: boolean;
}): boolean {
  return Boolean(input.basisAvailable) && !input.basisStale;
}

export function basisOptionalNote(input: {
  basisAvailable?: boolean;
  basisStale?: boolean;
}): string | null {
  return isBasisUsable(input) ? null : BASIS_UNAVAILABLE_NOTE;
}

/**
 * Same-venue basis only.
 * Basis = futures − spot/index
 * Basis% = (futures − spot/index) / spot/index
 * Never invents 0 when a source is missing.
 */
export function computeBasis(input: {
  futures?: BasisQuote | null;
  index?: BasisQuote | null;
  spot?: BasisQuote | null;
  nowMs?: number;
  staleLimitSec?: number;
  maxSkewMs?: number;
}): BasisResult {
  const nowMs = input.nowMs ?? Date.now();
  const staleLimitSec = input.staleLimitSec ?? 60;
  const maxSkewMs = input.maxSkewMs ?? BASIS_MAX_SKEW_MS;
  const futures = input.futures ?? null;

  if (!futures) return emptyBasisResult("missing futures price");
  if (!finitePrice(futures.price)) return emptyBasisResult("missing futures price");
  if (futures.price <= 0) return emptyBasisResult("invalid futures price");

  const picked = pickReference(futures, input.index, input.spot);
  if (!picked.ok) return emptyBasisResult(picked.reason);
  const ref = picked.ref;
  if (!finitePrice(ref.price)) return emptyBasisResult("missing spot/index price");
  if (ref.price <= 0) return emptyBasisResult("invalid spot/index price");

  if (!futures.timestamp) return emptyBasisResult("missing futures timestamp");
  if (!ref.timestamp) return emptyBasisResult("missing spot/index timestamp");

  const futMs = new Date(futures.timestamp).getTime();
  const refMs = new Date(ref.timestamp).getTime();
  if (!Number.isFinite(futMs) || futMs <= 0) {
    return emptyBasisResult("missing futures timestamp");
  }
  if (!Number.isFinite(refMs) || refMs <= 0) {
    return emptyBasisResult("missing spot/index timestamp");
  }
  if (Math.abs(futMs - refMs) > maxSkewMs) {
    return emptyBasisResult("mismatched timestamps");
  }

  const basis = futures.price - ref.price;
  const basisPct = basis / ref.price;
  if (!Number.isFinite(basis) || !Number.isFinite(basisPct)) {
    return emptyBasisResult("invalid basis calculation");
  }

  const timestamp = new Date(Math.min(futMs, refMs)).toISOString();
  const stale = isStale(timestamp, staleLimitSec, nowMs);
  const age = ageSeconds(timestamp, nowMs);

  return {
    available: true,
    reason: null,
    basis,
    basisPct,
    futuresPrice: futures.price,
    spotIndexPrice: ref.price,
    spotKind: ref.kind === "spot" ? "spot" : "index",
    source: sourceLabel(futures, ref),
    futuresInstrument: futures.instrument,
    spotInstrument: ref.instrument,
    timestamp,
    ageSec: age,
    stale,
    status: stale ? "stale" : "fresh",
  };
}
