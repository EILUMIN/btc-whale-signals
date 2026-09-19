import { SATS_PER_BTC } from "@/lib/constants";
import { fetchJson, fetchText, withRetry } from "@/lib/http";
import type { EsploraTx, MempoolTxPreview } from "@/lib/types";
import {
  esploraBases,
  explorerTxUrl,
  mempoolUrl,
  toAbsoluteUrl,
} from "@/lib/urls";

export { explorerTxUrl };

export function satsToBtc(sats: number) {
  return sats / SATS_PER_BTC;
}

export type FeeLadder = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  source: string;
};

export type RecentBlock = {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
};

async function esploraJson<T>(path: string): Promise<{ data: T; source: string }> {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  let lastError: unknown;
  for (const base of esploraBases()) {
    try {
      const data = await withRetry(() => fetchJson<T>(`${base}${suffix}`), 2, 250);
      const source = base.includes("blockstream") ? "Blockstream" : "Mempool.space";
      return { data, source };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Esplora ${suffix} failed`);
}

async function esploraText(path: string): Promise<string> {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  let lastError: unknown;
  for (const base of esploraBases()) {
    try {
      return await withRetry(() => fetchText(`${base}${suffix}`), 2, 250);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Esplora ${suffix} failed`);
}

export async function fetchMempoolRecent(): Promise<MempoolTxPreview[]> {
  try {
    const { data } = await esploraJson<MempoolTxPreview[]>("/mempool/recent");
    return data;
  } catch {
    return [];
  }
}

export async function fetchTx(txid: string): Promise<EsploraTx> {
  const { data } = await esploraJson<EsploraTx>(`/tx/${txid}`);
  return data;
}

export async function fetchAddressTxs(address: string): Promise<EsploraTx[]> {
  const { data } = await esploraJson<EsploraTx[]>(`/address/${address}/txs`);
  return data;
}

export async function fetchTipHash(): Promise<string> {
  return esploraText("/blocks/tip/hash");
}

export async function fetchTipHeight(): Promise<number> {
  const text = await esploraText("/blocks/tip/height");
  const height = Number(text);
  if (!Number.isFinite(height)) throw new Error("tip height");
  return height;
}

export async function fetchRecentBlocks(): Promise<RecentBlock[]> {
  try {
    const { data } = await esploraJson<RecentBlock[]>("/v1/blocks");
    return data;
  } catch {
    const { data } = await esploraJson<RecentBlock[]>("/blocks");
    return data;
  }
}

export async function fetchBlockTxs(
  hash: string,
  startIndex = 0
): Promise<EsploraTx[]> {
  const path =
    startIndex > 0 ? `/block/${hash}/txs/${startIndex}` : `/block/${hash}/txs`;
  const { data } = await esploraJson<EsploraTx[]>(path);
  return data;
}

export async function fetchFeeLadder(): Promise<FeeLadder> {
  try {
    const { data, source } = await esploraJson<{
      fastestFee?: number;
      halfHourFee?: number;
      hourFee?: number;
    }>("/v1/fees/recommended");
    return {
      fastestFee: Number(data.fastestFee ?? 20),
      halfHourFee: Number(data.halfHourFee ?? 10),
      hourFee: Number(data.hourFee ?? 5),
      source,
    };
  } catch {
    try {
      const { data, source } = await esploraJson<Record<string, number>>(
        "/fee-estimates"
      );
      return {
        fastestFee: Number(data["1"] ?? 20),
        halfHourFee: Number(data["3"] ?? data["2"] ?? 10),
        hourFee: Number(data["6"] ?? 5),
        source,
      };
    } catch {
      return {
        fastestFee: 20,
        halfHourFee: 10,
        hourFee: 5,
        source: "default",
      };
    }
  }
}

export function txFeeRateSatVb(tx: EsploraTx): number | null {
  const fee = Number(tx.fee ?? 0);
  const weight = Number(tx.weight ?? 0);
  const size = Number(tx.size ?? 0);
  const vsize = weight > 0 ? weight / 4 : size;
  if (!(fee > 0) || !(vsize > 0)) return null;
  return fee / vsize;
}

export function confirmationsFor(
  tx: EsploraTx,
  tipHeight: number | null
): number {
  if (!tx.status?.confirmed || !tx.status.block_height || !tipHeight) return 0;
  return Math.max(tipHeight - tx.status.block_height + 1, 1);
}

export function estimateArrival(
  satVb: number | null,
  ladder: FeeLadder,
  confirmed: boolean
): { minutes: number | null; label: string } {
  if (confirmed) return { minutes: 0, label: "in a block" };
  if (!(satVb && satVb > 0)) return { minutes: null, label: "unknown ETA" };
  if (satVb >= ladder.fastestFee) return { minutes: 10, label: "~10 min (next block)" };
  if (satVb >= ladder.halfHourFee) return { minutes: 30, label: "~30 min" };
  if (satVb >= ladder.hourFee) return { minutes: 60, label: "~60 min" };
  return { minutes: 180, label: "3h+ (low fee)" };
}

export function txTotalOutputSats(tx: EsploraTx) {
  return tx.vout.reduce((sum, output) => sum + (output.value || 0), 0);
}

export function txTimestampUnix(tx: EsploraTx, fallback?: number) {
  if (tx.status?.confirmed && tx.status.block_time) {
    return tx.status.block_time;
  }
  return fallback ?? Math.floor(Date.now() / 1000);
}

/** Kept so existing relative-path tests still pass. */
export function mempoolRecentUrl() {
  return mempoolUrl("/mempool/recent");
}

export { toAbsoluteUrl };
