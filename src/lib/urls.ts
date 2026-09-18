const MEMPOOL_API_DEFAULT = "https://mempool.space/api";
const MEMPOOL_EXPLORER_DEFAULT = "https://mempool.space";
const MEMPOOL_WS_DEFAULT = "wss://mempool.space/api/v1/ws";

function firstEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

/** Deployed app origin: https://your-app.vercel.app */
export function appOrigin() {
  const raw = firstEnv(
    "NEXT_PUBLIC_VERCEL_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL"
  );
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return `https://${raw.replace(/\/$/, "")}`;
}

/**
 * Node fetch() on Vercel rejects relative paths like `/mempool/recent`.
 * Absolute http(s) URLs pass through. Relative paths are resolved against
 * the deployed origin (NEXT_PUBLIC_VERCEL_URL / VERCEL_URL).
 */
export function toAbsoluteUrl(url: string) {
  const value = url.trim();
  if (!value) {
    throw new Error("Failed to parse URL from empty string");
  }
  if (/^https?:\/\//i.test(value) || /^wss?:\/\//i.test(value)) {
    return value;
  }
  const origin = appOrigin();
  if (!origin) {
    throw new Error(`Failed to parse URL from ${value}`);
  }
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

function absoluteOrFallback(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  if (trimmed && /^wss?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return fallback.replace(/\/$/, "");
}

export const MEMPOOL_API = absoluteOrFallback(
  process.env.MEMPOOL_API_BASE,
  MEMPOOL_API_DEFAULT
);

export const MEMPOOL_EXPLORER = absoluteOrFallback(
  process.env.MEMPOOL_EXPLORER_BASE,
  MEMPOOL_EXPLORER_DEFAULT
);

export const MEMPOOL_WS = absoluteOrFallback(
  process.env.MEMPOOL_WS_URL,
  MEMPOOL_WS_DEFAULT
);

export function mempoolUrl(path: string) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return toAbsoluteUrl(`${MEMPOOL_API}${suffix}`);
}

export function explorerTxUrl(txid: string) {
  return toAbsoluteUrl(`${MEMPOOL_EXPLORER}/tx/${txid}`);
}

function apiUrl(path: string) {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  const origin = appOrigin();
  if (origin) return `${origin}${path}`;
  return toAbsoluteUrl(path);
}

export function signalsApiUrl() {
  return apiUrl("/api/signals");
}

export function matrixApiUrl() {
  return apiUrl("/api/signals");
}

/** Live BTC/USD only — does not wait for a mempool scan or whale timestamp. */
export function priceApiUrl() {
  return apiUrl("/api/price");
}
