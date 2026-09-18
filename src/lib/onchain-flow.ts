import { classifyTransaction } from "@/lib/classify";
import { SATS_PER_BTC, WHALE_THRESHOLD_BTC } from "@/lib/constants";
import {
  FLOW_WINDOW_SEC,
  WHALE_BTC,
  type OnchainFlow,
} from "@/lib/m1";
import {
  fetchAddressTxs,
  fetchMempoolRecent,
  fetchRecentBlocks,
  fetchBlockTxs,
  fetchTx,
  satsToBtc,
  txTimestampUnix,
  txTotalOutputSats,
} from "@/lib/mempool";
import type { EsploraTx } from "@/lib/types";

const FLOW_FETCH_BTC = 50;

const WATCH_ADDRESSES = [
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
  "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97",
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS",
  "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r",
];

function isoFromUnix(unix: number) {
  return new Date(unix * 1000).toISOString();
}

function flowKind(
  movement: string
): "inflow" | "outflow" | "internal" | "unlabeled" {
  if (movement === "Wallet to Exchange") return "inflow";
  if (movement === "Exchange to Wallet") return "outflow";
  if (movement === "Exchange Internal") return "internal";
  return "unlabeled";
}

export async function scanOnchainFlow(
  nowUnix = Math.floor(Date.now() / 1000)
): Promise<OnchainFlow> {
  const cutoff = nowUnix - FLOW_WINDOW_SEC;
  const txs = new Map<string, EsploraTx>();

  const [recent, blocks, watched] = await Promise.all([
    fetchMempoolRecent().catch(() => []),
    fetchRecentBlocks().catch(() => []),
    Promise.all(
      WATCH_ADDRESSES.map((address) => fetchAddressTxs(address).catch(() => []))
    ),
  ]);

  for (const preview of recent) {
    const btc = satsToBtc(preview.value ?? 0);
    if (btc < FLOW_FETCH_BTC) continue;
    try {
      const tx = await fetchTx(preview.txid);
      txs.set(tx.txid, tx);
    } catch {
      // skip a single tx failure
    }
  }

  for (const block of blocks.slice(0, 2)) {
    try {
      const rows = await fetchBlockTxs(block.id);
      for (const tx of rows) txs.set(tx.txid, tx);
    } catch {
      // skip a block page
    }
  }

  for (const list of watched) {
    for (const tx of list) txs.set(tx.txid, tx);
  }

  let inflows = 0;
  let outflows = 0;
  const prints: OnchainFlow["prints"] = [];

  for (const tx of txs.values()) {
    const when = txTimestampUnix(tx, nowUnix);
    if (when < cutoff) continue;
    const btc = satsToBtc(txTotalOutputSats(tx));
    if (btc < FLOW_FETCH_BTC) continue;
    const classified = classifyTransaction(tx);
    if (classified.isCoinbase) continue;
    const kind = flowKind(classified.movement);
    const sized =
      kind === "inflow"
        ? classified.exchangeInBtc
        : kind === "outflow"
          ? classified.walletInBtc || classified.exchangeOutBtc
          : btc;
    if (kind === "inflow") inflows += sized;
    if (kind === "outflow") outflows += sized;
    if (sized >= Math.min(WHALE_THRESHOLD_BTC, WHALE_BTC) / 5 || btc >= FLOW_FETCH_BTC) {
      prints.push({
        txid: tx.txid,
        btc: Math.round(sized * 100) / 100,
        kind,
        when: isoFromUnix(when),
      });
    }
  }

  prints.sort((a, b) => (a.when < b.when ? 1 : -1));

  return {
    inflows: Math.round(inflows * 100) / 100,
    outflows: Math.round(outflows * 100) / 100,
    netflow: Math.round((inflows - outflows) * 100) / 100,
    prints: prints.slice(0, 24),
  };
}

export { SATS_PER_BTC };
