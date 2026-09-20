import { ageSeconds, isStale } from "@/lib/format";

export const OKX_LIQ_SOURCE = "okx-liq";
export const OKX_LIQ_INSTRUMENT = "BTC-USDT-SWAP";
export const OKX_LIQ_ULY = "BTC-USDT";
/** Official OKX BTC-USDT-SWAP contract value. */
export const OKX_BTC_USDT_SWAP_CTVAL = 0.01;

export type LiquidationStatus = "fresh" | "stale" | "unavailable";

export type LiquidationEvent = {
  side: "long" | "short";
  usd: number;
  timestamp: string | null;
};

export type LiquidationResult = {
  available: boolean;
  reason: string | null;
  longUsd: number | null;
  shortUsd: number | null;
  eventCount: number | null;
  longCount: number | null;
  shortCount: number | null;
  source: string | null;
  timestamp: string | null;
  latestEventTimestamp: string | null;
  ageSec: number | null;
  stale: boolean;
  status: LiquidationStatus;
  httpStatus: number | null;
  displayLong: string;
  displayShort: string;
  detail: string | null;
};

export type OkxLiquidationDetail = {
  bkPx?: string;
  sz?: string;
  side?: string;
  posSide?: string;
  ts?: string | number;
  time?: number;
};

export type OkxLiquidationGroup = {
  details?: OkxLiquidationDetail[];
  instId?: string;
  uly?: string;
  instFamily?: string;
};

export type OkxLiquidationPayload = {
  code?: string;
  msg?: string;
  data?: unknown;
};

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoFromTs(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString();
}

function usd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

function classifySide(row: OkxLiquidationDetail): "long" | "short" | null {
  const pos = String(row.posSide ?? "").toLowerCase();
  if (pos === "long") return "long";
  if (pos === "short") return "short";
  const side = String(row.side ?? "").toLowerCase();
  if (side === "sell") return "long";
  if (side === "buy") return "short";
  return null;
}

function sameBtcUsdt(group: OkxLiquidationGroup) {
  const inst = String(group.instId ?? "").toUpperCase();
  const uly = String(group.uly ?? group.instFamily ?? "").toUpperCase();
  if (inst && inst !== OKX_LIQ_INSTRUMENT) return false;
  if (uly && uly !== OKX_LIQ_ULY) return false;
  return Boolean(inst || uly);
}

function displays(result: Omit<LiquidationResult, "displayLong" | "displayShort" | "detail">): LiquidationResult {
  let displayLong = "Unavailable";
  let displayShort = "Unavailable";
  let detail: string | null = result.reason;
  if (!result.available) {
    displayLong = "Unavailable";
    displayShort = "Unavailable";
    detail = result.reason;
  } else if (result.stale) {
    displayLong = "Data stale";
    displayShort = "Data stale";
    detail = [
      result.eventCount !== null ? `${result.eventCount} events` : null,
      result.reason,
    ]
      .filter(Boolean)
      .join(" · ") || "Data stale";
  } else if ((result.eventCount ?? 0) === 0) {
    displayLong = "$0.00 · No liquidation events";
    displayShort = "$0.00 · No liquidation events";
    detail = "0 events";
  } else {
    displayLong = usd(result.longUsd ?? 0);
    displayShort = usd(result.shortUsd ?? 0);
    detail = `${result.eventCount} events (${result.longCount} long / ${result.shortCount} short)`;
  }
  return { ...result, displayLong, displayShort, detail };
}

export function emptyLiquidations(reason: string, extra: Partial<LiquidationResult> = {}): LiquidationResult {
  return displays({
    longUsd: null,
    shortUsd: null,
    eventCount: null,
    longCount: null,
    shortCount: null,
    source: null,
    timestamp: null,
    latestEventTimestamp: null,
    ageSec: null,
    stale: false,
    httpStatus: null,
    ...extra,
    available: false,
    reason: extra.reason ?? reason,
    status: extra.status ?? "unavailable",
  });
}

export function summarizeEvents(
  events: LiquidationEvent[],
  input: {
    source: string;
    fetchedAt: string;
    nowMs?: number;
    staleLimitSec?: number;
    httpStatus?: number | null;
  }
): LiquidationResult {
  const nowMs = input.nowMs ?? Date.now();
  const staleLimitSec = input.staleLimitSec ?? 60;
  const stale = isStale(input.fetchedAt, staleLimitSec, nowMs);
  let longUsd = 0;
  let shortUsd = 0;
  let longCount = 0;
  let shortCount = 0;
  let latestMs = 0;
  for (const event of events) {
    if (event.side === "long") {
      longUsd += event.usd;
      longCount += 1;
    } else {
      shortUsd += event.usd;
      shortCount += 1;
    }
    const ts = event.timestamp ? new Date(event.timestamp).getTime() : NaN;
    if (Number.isFinite(ts)) latestMs = Math.max(latestMs, ts);
  }
  return displays({
    available: true,
    reason: null,
    longUsd,
    shortUsd,
    eventCount: events.length,
    longCount,
    shortCount,
    source: input.source,
    timestamp: input.fetchedAt,
    latestEventTimestamp: latestMs > 0 ? new Date(latestMs).toISOString() : null,
    ageSec: ageSeconds(input.fetchedAt, nowMs),
    stale,
    status: stale ? "stale" : "fresh",
    httpStatus: input.httpStatus ?? 200,
  });
}

/**
 * Parse a public OKX /liquidation-orders body.
 * Events live in data[].details[]. The parent group is not an event.
 */
export function parseOkxLiquidations(
  payload: OkxLiquidationPayload | null | undefined,
  input: {
    fetchedAt?: string;
    nowMs?: number;
    staleLimitSec?: number;
    httpStatus?: number | null;
    ctVal?: number;
  } = {}
): LiquidationResult {
  const fetchedAt = input.fetchedAt ?? new Date(input.nowMs ?? Date.now()).toISOString();
  const httpStatus = input.httpStatus ?? null;
  const ctVal = input.ctVal ?? OKX_BTC_USDT_SWAP_CTVAL;

  if (payload === null) {
    return emptyLiquidations("null response", { httpStatus });
  }
  if (payload === undefined) {
    return emptyLiquidations("missing response", { httpStatus });
  }
  if (typeof payload !== "object") {
    return emptyLiquidations("invalid response format", { httpStatus });
  }
  if (payload.code !== undefined && String(payload.code) !== "0") {
    const msg = payload.msg?.trim();
    return emptyLiquidations(
      msg ? `API error ${payload.code}: ${msg}` : `API error ${payload.code}`,
      { httpStatus, source: OKX_LIQ_SOURCE }
    );
  }
  if (!("data" in payload) || payload.data === undefined) {
    return emptyLiquidations("missing liquidation data", { httpStatus, source: OKX_LIQ_SOURCE });
  }
  if (payload.data === null) {
    return emptyLiquidations("null response", { httpStatus, source: OKX_LIQ_SOURCE });
  }
  if (!Array.isArray(payload.data)) {
    return emptyLiquidations("invalid response format", { httpStatus, source: OKX_LIQ_SOURCE });
  }
  if (payload.data.length === 0) {
    return summarizeEvents([], {
      source: OKX_LIQ_SOURCE,
      fetchedAt,
      nowMs: input.nowMs,
      staleLimitSec: input.staleLimitSec,
      httpStatus: httpStatus ?? 200,
    });
  }

  const events: LiquidationEvent[] = [];
  let sawGroup = false;
  let sawDetailsKey = false;
  for (const row of payload.data) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return emptyLiquidations("invalid response format", {
        httpStatus,
        source: OKX_LIQ_SOURCE,
      });
    }
    const group = row as OkxLiquidationGroup;
    if (!sameBtcUsdt(group)) {
      continue;
    }
    sawGroup = true;
    if (!("details" in group)) {
      return emptyLiquidations("invalid response format", {
        httpStatus,
        source: OKX_LIQ_SOURCE,
      });
    }
    sawDetailsKey = true;
    if (group.details === null) {
      return emptyLiquidations("null response", { httpStatus, source: OKX_LIQ_SOURCE });
    }
    if (!Array.isArray(group.details)) {
      return emptyLiquidations("invalid response format", {
        httpStatus,
        source: OKX_LIQ_SOURCE,
      });
    }
    for (const detail of group.details) {
      if (!detail || typeof detail !== "object") {
        return emptyLiquidations("invalid response format", {
          httpStatus,
          source: OKX_LIQ_SOURCE,
        });
      }
      const side = classifySide(detail);
      const sz = finite(detail.sz);
      const px = finite(detail.bkPx);
      if (side === null || sz === null || px === null || sz < 0 || px <= 0) {
        return emptyLiquidations("invalid response format", {
          httpStatus,
          source: OKX_LIQ_SOURCE,
        });
      }
      if (sz === 0) continue;
      events.push({
        side,
        usd: sz * ctVal * px,
        timestamp: isoFromTs(detail.ts ?? detail.time),
      });
    }
  }

  if (!sawGroup) {
    return emptyLiquidations("mismatched instruments", {
      httpStatus,
      source: OKX_LIQ_SOURCE,
    });
  }
  if (!sawDetailsKey) {
    return emptyLiquidations("invalid response format", {
      httpStatus,
      source: OKX_LIQ_SOURCE,
    });
  }

  return summarizeEvents(events, {
    source: `${OKX_LIQ_SOURCE} · ${OKX_LIQ_INSTRUMENT}`,
    fetchedAt,
    nowMs: input.nowMs,
    staleLimitSec: input.staleLimitSec,
    httpStatus: httpStatus ?? 200,
  });
}

export function parseBinanceForceOrders(
  rows: Array<{ side?: string; price?: string; origQty?: string; time?: number }> | null | undefined,
  input: {
    fetchedAt?: string;
    nowMs?: number;
    staleLimitSec?: number;
    httpStatus?: number | null;
  } = {}
): LiquidationResult {
  const fetchedAt = input.fetchedAt ?? new Date(input.nowMs ?? Date.now()).toISOString();
  if (rows === null) return emptyLiquidations("null response", { httpStatus: input.httpStatus });
  if (rows === undefined) return emptyLiquidations("missing response", { httpStatus: input.httpStatus });
  if (!Array.isArray(rows)) {
    return emptyLiquidations("invalid response format", { httpStatus: input.httpStatus });
  }
  const events: LiquidationEvent[] = [];
  for (const row of rows) {
    const qty = finite(row.origQty);
    const px = finite(row.price);
    if (qty === null || px === null || qty < 0 || px <= 0) {
      return emptyLiquidations("invalid response format", { httpStatus: input.httpStatus });
    }
    if (qty === 0) continue;
    const side = String(row.side ?? "").toUpperCase() === "SELL" ? "long" : "short";
    events.push({
      side,
      usd: qty * px,
      timestamp: isoFromTs(row.time),
    });
  }
  return summarizeEvents(events, {
    source: "binance-force · BTCUSDT",
    fetchedAt,
    nowMs: input.nowMs,
    staleLimitSec: input.staleLimitSec,
    httpStatus: input.httpStatus ?? 200,
  });
}
