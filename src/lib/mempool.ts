import { SATS_PER_BTC } from "@/lib/constants";
import { fetchJson, withRetry } from "@/lib/http";
import type { EsploraTx, MempoolTxPreview } from "@/lib/types";
import { explorerTxUrl, mempoolUrl, toAbsoluteUrl } from "@/lib/urls";

export { explorerTxUrl };

export function satsToBtc(sats: number) {
  return sats / SATS_PER_BTC;
}

export async function fetchMempoolRecent(): Promise<MempoolTxPreview[]> {
  return withRetry(() =>
    fetchJson<MempoolTxPreview[]>(mempoolUrl("/mempool/recent"))
  );
}

export async function fetchTx(txid: string): Promise<EsploraTx> {
  return withRetry(() => fetchJson<EsploraTx>(mempoolUrl(`/tx/${txid}`)));
}

export async function fetchAddressTxs(address: string): Promise<EsploraTx[]> {
  return withRetry(() =>
    fetchJson<EsploraTx[]>(mempoolUrl(`/address/${address}/txs`))
  );
}

export async function fetchTipHash(): Promise<string> {
  const hash = await withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(toAbsoluteUrl(mempoolUrl("/blocks/tip/hash")), {
        signal: controller.signal,
        cache: "no-store",
        headers: { "User-Agent": "btc-whale-signals/1.0 (local dashboard)" },
      });
      if (!response.ok) {
        throw new Error(`tip hash ${response.status}`);
      }
      return (await response.text()).trim();
    } finally {
      clearTimeout(timer);
    }
  });
  return hash;
}

export type RecentBlock = {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
};

export async function fetchRecentBlocks(): Promise<RecentBlock[]> {
  return withRetry(() => fetchJson<RecentBlock[]>(mempoolUrl("/v1/blocks")));
}

export async function fetchBlockTxs(
  hash: string,
  startIndex = 0
): Promise<EsploraTx[]> {
  const path =
    startIndex > 0
      ? mempoolUrl(`/block/${hash}/txs/${startIndex}`)
      : mempoolUrl(`/block/${hash}/txs`);
  return withRetry(() => fetchJson<EsploraTx[]>(path));
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
