import { FETCH_TIMEOUT_MS } from "@/lib/constants";
import { toAbsoluteUrl } from "@/lib/urls";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<T> {
  const absolute = toAbsoluteUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(absolute, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "btc-whale-signals/1.0 (local dashboard)",
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new HttpError(
        `${response.status} ${response.statusText}`,
        response.status,
        absolute
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(message, undefined, absolute);
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 400
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error instanceof HttpError ? error.status : undefined;
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }
      await sleep(delayMs * (i + 1));
    }
  }
  throw lastError;
}
