export const SATS_PER_BTC = 100_000_000;

export const WHALE_THRESHOLD_BTC = Number(
  process.env.WHALE_THRESHOLD_BTC ?? 500
);

export const MEMPOOL_API = (
  process.env.MEMPOOL_API_BASE ?? "https://mempool.space/api"
).replace(/\/$/, "");

export const MEMPOOL_WS = process.env.MEMPOOL_WS_URL ?? "wss://mempool.space/api/v1/ws";

export const MEMPOOL_EXPLORER = (
  process.env.MEMPOOL_EXPLORER_BASE ?? "https://mempool.space"
).replace(/\/$/, "");

export const SCAN_INTERVAL_MS = 20_000;
export const PRICE_INTERVAL_MS = 8_000;
export const MAX_SIGNALS = 80;
export const MAX_TAPE = 24;
export const FETCH_TIMEOUT_MS = 12_000;
