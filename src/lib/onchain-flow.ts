import { classifyTransaction } from "@/lib/classify";
import { TRACKED_EXCHANGE_ADDRESSES } from "@/lib/exchange-addresses";
import {
  FLOW_WINDOW_SEC,
  TAPE_BTC,
  emptyOnchainFlow,
  type FlowKind,
  type FlowPrint,
  type OnchainFlow,
} from "@/lib/m1";
import {
  confirmationsFor,
  estimateArrival,
  explorerTxUrl,
  fetchAddressTxs,
  fetchBlockTxs,
  fetchFeeLadder,
  fetchMempoolRecent,
  fetchRecentBlocks,
  fetchTipHeight,
  fetchTx,
  satsToBtc,
  txFeeRateSatVb,
  txTimestampUnix,
  txTotalOutputSats,
  type FeeLadder,
} from "@/lib/mempool";
import type { EsploraTx } from "@/lib/types";

const ADDRESS_CONCURRENCY = 13;
const BLOCK_PAGES = 2;
const BLOCK_COUNT = 2;

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const rows = await Promise.all(chunk.map((item) => fn(item)));
    out.push(...rows);
  }
  return out;
}

function isoFromUnix(unix: number) {
  return new Date(unix * 1000).toISOString();
}

function flowKind(movement: string): FlowKind {
  if (movement === "Wallet to Exchange") return "inflow";
  if (movement === "Exchange to Wallet") return "outflow";
  if (movement === "Exchange Internal") return "internal";
  return "unlabeled";
}

function entityLabel(row: { entity: string | null; label: string }) {
  return row.entity || row.label;
}

export async function scanOnchainFlow(
  nowUnix = Math.floor(Date.now() / 1000)
): Promise<OnchainFlow> {
  const cutoff = nowUnix - FLOW_WINDOW_SEC;
  const txs = new Map<string, EsploraTx>();
  let esploraSource = "Mempool.space";

  const [recent, blocks, tipHeight, ladder, watched] = await Promise.all([
    fetchMempoolRecent().catch(() => []),
    fetchRecentBlocks().catch(() => []),
    fetchTipHeight().catch(() => null),
    fetchFeeLadder().catch(
      (): FeeLadder => ({
        fastestFee: 20,
        halfHourFee: 10,
        hourFee: 5,
        source: "default",
      })
    ),
    mapPool(TRACKED_EXCHANGE_ADDRESSES, ADDRESS_CONCURRENCY, (address) =>
      fetchAddressTxs(address).catch(() => [] as EsploraTx[])
    ),
  ]);
  esploraSource = ladder.source === "default" ? "Mempool.space" : ladder.source;

  const largeRecent = recent
    .filter((preview) => satsToBtc(preview.value ?? 0) >= TAPE_BTC)
    .slice(0, 6);
  await mapPool(largeRecent, 3, async (preview) => {
    try {
      const tx = await fetchTx(preview.txid);
      txs.set(tx.txid, tx);
    } catch {
      // skip a single tx failure
    }
  });

  for (const block of blocks.slice(0, BLOCK_COUNT)) {
    for (let page = 0; page < BLOCK_PAGES; page += 1) {
      try {
        const rows = await fetchBlockTxs(block.id, page * 25);
        if (!rows.length) break;
        for (const tx of rows) txs.set(tx.txid, tx);
        if (rows.length < 25) break;
      } catch {
        break;
      }
    }
  }

  for (const list of watched) {
    for (const tx of list) txs.set(tx.txid, tx);
  }

  let inflows = 0;
  let outflows = 0;
  let unlabeled = 0;
  let internal = 0;
  let pendingBtc = 0;
  let confirmedBtc = 0;
  const prints: FlowPrint[] = [];

  for (const tx of txs.values()) {
    const when = txTimestampUnix(tx, nowUnix);
    if (when < cutoff) continue;
    const btc = satsToBtc(txTotalOutputSats(tx));
    if (btc < TAPE_BTC) continue;
    const classified = classifyTransaction(tx);
    if (classified.isCoinbase) continue;
    const kind = flowKind(classified.movement);
    const sized =
      kind === "inflow"
        ? classified.exchangeInBtc || btc
        : kind === "outflow"
          ? classified.walletInBtc || classified.exchangeOutBtc || btc
          : btc;
    if (kind === "inflow") inflows += sized;
    else if (kind === "outflow") outflows += sized;
    else if (kind === "internal") internal += sized;
    else unlabeled += sized;

    const confirmed = Boolean(tx.status?.confirmed);
    if (confirmed) confirmedBtc += sized;
    else pendingBtc += sized;

    const satVb = txFeeRateSatVb(tx);
    const eta = estimateArrival(satVb, ladder, confirmed);
    prints.push({
      txid: tx.txid,
      btc: Math.round(sized * 100) / 100,
      kind,
      when: isoFromUnix(when),
      confirmed,
      confirmations: confirmationsFor(tx, tipHeight),
      pending: !confirmed,
      etaMinutes: eta.minutes,
      etaLabel: eta.label,
      fromLabel: entityLabel(classified.primaryFrom),
      toLabel: entityLabel(classified.primaryTo),
      explorerUrl: explorerTxUrl(tx.txid),
    });
  }

  prints.sort((a, b) => {
    if (a.pending !== b.pending) return a.pending ? -1 : 1;
    return a.when < b.when ? 1 : -1;
  });

  return {
    inflows: Math.round(inflows * 100) / 100,
    outflows: Math.round(outflows * 100) / 100,
    unlabeled: Math.round(unlabeled * 100) / 100,
    internal: Math.round(internal * 100) / 100,
    netflow: Math.round((inflows - outflows) * 100) / 100,
    pendingBtc: Math.round(pendingBtc * 100) / 100,
    confirmedBtc: Math.round(confirmedBtc * 100) / 100,
    watchedWallets: TRACKED_EXCHANGE_ADDRESSES.length,
    esploraSource,
    prints: prints.slice(0, 40),
  };
}

export { emptyOnchainFlow };
