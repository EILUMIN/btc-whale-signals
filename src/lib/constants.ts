export const SATS_PER_BTC = 100_000_000;

export const WHALE_THRESHOLD_BTC = Number(
  process.env.WHALE_THRESHOLD_BTC || 500
);

export {
  MEMPOOL_API,
  MEMPOOL_EXPLORER,
  MEMPOOL_WS,
} from "@/lib/urls";

export const SCAN_INTERVAL_MS = 20_000;
export const PRICE_INTERVAL_MS = 8_000;
export const MAX_SIGNALS = 80;
export const MAX_TAPE = 24;
export const FETCH_TIMEOUT_MS = 12_000;
