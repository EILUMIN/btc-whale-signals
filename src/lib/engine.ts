import { TRACKED_EXCHANGE_ADDRESSES } from "@/lib/exchange-addresses";
import { classifyTransaction } from "@/lib/classify";
import {
  MAX_SIGNALS,
  MAX_TAPE,
  MEMPOOL_WS,
  PRICE_INTERVAL_MS,
  SATS_PER_BTC,
  SCAN_INTERVAL_MS,
  WHALE_THRESHOLD_BTC,
} from "@/lib/constants";
import { formatAlertTerminal } from "@/lib/format";
import {
  fetchAddressTxs,
  fetchMempoolRecent,
  fetchRecentBlocks,
  fetchTx,
  satsToBtc,
  txTimestampUnix,
  txTotalOutputSats,
  explorerTxUrl,
} from "@/lib/mempool";
import { sleep } from "@/lib/http";
import {
  fetchLivePrice,
  fetchPriceAtUnix,
  fetchRecentHourlies,
  roundPrice,
  type HourlyCandle,
} from "@/lib/price";
import { decideSignal } from "@/lib/signals";
import type {
  EngineSnapshot,
  EsploraTx,
  LivePrice,
  TapePrint,
  WhaleSignal,
} from "@/lib/types";

type EngineOptions = {
  thresholdBtc?: number;
  onSignal?: (signal: WhaleSignal) => void;
  log?: (message: string) => void;
};

const globalStore = globalThis as unknown as {
  __whaleEngine?: WhaleEngine;
};

export class WhaleEngine {
  readonly thresholdBtc: number;
  private readonly onSignal?: (signal: WhaleSignal) => void;
  private readonly log: (message: string) => void;

  private signals = new Map<string, WhaleSignal>();
  private tape: TapePrint[] = [];
  private price: LivePrice | null = null;
  private candles: HourlyCandle[] = [];
  private lastScanAt: string | null = null;
  private scanning = false;
  private liveFeed = false;
  private error: string | null = null;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private ws: WebSocket | null = null;
  private timers: NodeJS.Timeout[] = [];
  private pending = new Set<string>();
  private addressCursor = 0;

  constructor(options: EngineOptions = {}) {
    this.thresholdBtc = options.thresholdBtc ?? WHALE_THRESHOLD_BTC;
    this.onSignal = options.onSignal;
    this.log = options.log ?? (() => undefined);
  }

  snapshot(): EngineSnapshot {
    const rank = (signal: WhaleSignal) => (signal.signal === "WATCH" ? 1 : 0);
    const signals = [...this.signals.values()].sort((a, b) => {
      const bySide = rank(a) - rank(b);
      if (bySide !== 0) return bySide;
      return b.timestampUnix - a.timestampUnix;
    });
    return {
      ok: this.error === null,
      error: this.error,
      price: this.price,
      thresholdBtc: this.thresholdBtc,
      lastScanAt: this.lastScanAt,
      scanning: this.scanning,
      liveFeed: this.liveFeed,
      trackedWallets: TRACKED_EXCHANGE_ADDRESSES.length,
      stats: {
        buy: signals.filter((row) => row.signal === "BUY").length,
        sell: signals.filter((row) => row.signal === "SELL").length,
        watch: signals.filter((row) => row.signal === "WATCH").length,
        total: signals.length,
      },
      signals,
      tape: this.tape.slice(0, MAX_TAPE),
    };
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.boot();
    return this.startPromise;
  }

  private async boot() {
    if (this.started) return;
    this.started = true;
    this.log(
      `Whale engine up. Threshold ${this.thresholdBtc} BTC. Watching ${TRACKED_EXCHANGE_ADDRESSES.length} exchange clusters.`
    );
    await this.refreshPrice();
    this.connectLiveFeed();
    await this.scan("startup");
    this.timers.push(
      setInterval(() => {
        void this.refreshPrice();
      }, PRICE_INTERVAL_MS)
    );
    this.timers.push(
      setInterval(() => {
        void this.scan("interval");
      }, SCAN_INTERVAL_MS)
    );
  }

  async refreshPrice() {
    try {
      this.price = await fetchLivePrice();
      if (this.candles.length === 0) {
        this.candles = await fetchRecentHourlies();
      }
      this.error = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error = `Price feed: ${message}`;
    }
  }

  async scan(reason: string) {
    if (this.scanning) return;
    this.scanning = true;
    this.log(`Scan (${reason})…`);
    try {
      await this.refreshPrice();
      if (this.candles.length === 0) {
        this.candles = await fetchRecentHourlies();
      }

      const recent = await fetchMempoolRecent();
      for (const tx of recent) {
        this.pushTape({
          txid: tx.txid,
          btc: satsToBtc(tx.value),
          timestampUnix: tx.time ?? Math.floor(Date.now() / 1000),
          confirmed: false,
        });
        if (tx.value >= this.thresholdBtc * SATS_PER_BTC) {
          await this.ingestTxid(tx.txid, "mempool", tx.time);
        }
      }

      const batchSize = 6;
      const start = this.addressCursor % TRACKED_EXCHANGE_ADDRESSES.length;
      const batch = Array.from({ length: batchSize }, (_, index) => {
        return TRACKED_EXCHANGE_ADDRESSES[
          (start + index) % TRACKED_EXCHANGE_ADDRESSES.length
        ];
      });
      this.addressCursor =
        (start + batchSize) % TRACKED_EXCHANGE_ADDRESSES.length;

      for (const address of batch) {
        try {
          const txs = await fetchAddressTxs(address);
          for (const tx of txs) {
            const total = txTotalOutputSats(tx);
            if (total >= this.thresholdBtc * SATS_PER_BTC) {
              await this.ingestTx(tx, "address-watch");
            }
          }
        } catch (error) {
          this.log(
            `Address ${address.slice(0, 8)}… skipped: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        await sleep(120);
      }

      try {
        const blocks = await fetchRecentBlocks();
        const latest = blocks[0];
        if (latest) {
          this.log(`Tip height ${latest.height} (${latest.tx_count} txs)`);
        }
      } catch {
        // non-fatal
      }

      this.lastScanAt = new Date().toISOString();
      this.error = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error = message;
      this.log(`Scan failed: ${message}`);
    } finally {
      this.scanning = false;
    }
  }

  private connectLiveFeed() {
    if (this.ws || typeof WebSocket === "undefined") return;
    try {
      const ws = new WebSocket(MEMPOOL_WS);
      this.ws = ws;
      ws.addEventListener("open", () => {
        this.liveFeed = true;
        this.log("Mempool websocket connected.");
        ws.send(JSON.stringify({ action: "init" }));
        ws.send(
          JSON.stringify({
            action: "want",
            data: ["blocks", "stats"],
          })
        );
        ws.send(JSON.stringify({ "watch-mempool": true }));
      });
      ws.addEventListener("message", (event) => {
        void this.onWsMessage(String(event.data));
      });
      ws.addEventListener("close", () => {
        this.liveFeed = false;
        this.ws = null;
        this.log("Mempool websocket closed. Reconnecting in 5s.");
        setTimeout(() => this.connectLiveFeed(), 5_000);
      });
      ws.addEventListener("error", () => {
        this.liveFeed = false;
      });
    } catch (error) {
      this.log(
        `Websocket unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async onWsMessage(raw: string) {
    try {
      const payload = JSON.parse(raw) as {
        transactions?: Array<{
          txid: string;
          value: number;
          time?: number;
        }>;
        block?: { id: string; height: number };
        "mempool-transactions"?: Array<{
          txid: string;
          value: number;
          time?: number;
        }>;
      };

      const incoming = [
        ...(payload.transactions ?? []),
        ...(payload["mempool-transactions"] ?? []),
      ];

      for (const tx of incoming) {
        if (typeof tx?.txid !== "string" || typeof tx.value !== "number") {
          continue;
        }
        this.pushTape({
          txid: tx.txid,
          btc: satsToBtc(tx.value),
          timestampUnix: tx.time ?? Math.floor(Date.now() / 1000),
          confirmed: false,
        });
        if (tx.value >= this.thresholdBtc * SATS_PER_BTC) {
          await this.ingestTxid(tx.txid, "mempool", tx.time);
        }
      }
    } catch {
      // ignore malformed frames
    }
  }

  private pushTape(print: TapePrint) {
    this.tape = [
      print,
      ...this.tape.filter((row) => row.txid !== print.txid),
    ]
      .sort((a, b) => b.btc - a.btc)
      .slice(0, MAX_TAPE);
  }

  private async ingestTxid(
    txid: string,
    seenIn: WhaleSignal["seenIn"],
    fallbackTime?: number
  ) {
    if (this.signals.has(txid) || this.pending.has(txid)) return;
    this.pending.add(txid);
    try {
      const tx = await fetchTx(txid);
      await this.ingestTx(tx, seenIn, fallbackTime);
    } catch (error) {
      this.log(
        `Failed to load tx ${txid.slice(0, 8)}… ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      this.pending.delete(txid);
    }
  }

  private async ingestTx(
    tx: EsploraTx,
    seenIn: WhaleSignal["seenIn"],
    fallbackTime?: number
  ) {
    if (this.signals.has(tx.txid)) {
      const existing = this.signals.get(tx.txid);
      if (existing && tx.status?.confirmed && !existing.confirmed) {
        existing.confirmed = true;
        existing.blockHeight = tx.status.block_height ?? null;
        existing.timestampUnix = txTimestampUnix(tx, existing.timestampUnix);
        existing.timestamp = new Date(existing.timestampUnix * 1000).toISOString();
      }
      return;
    }

    const totalBtc = satsToBtc(txTotalOutputSats(tx));
    if (totalBtc < this.thresholdBtc) return;

    const classified = classifyTransaction(tx);
    if (classified.isCoinbase) return;

    const timestampUnix = txTimestampUnix(tx, fallbackTime);
    const ageSeconds = Math.abs(Date.now() / 1000 - timestampUnix);
    let priceUsd = this.price?.usd ?? 0;
    let priceSource = this.price?.source ?? "unknown";

    if (ageSeconds > 90 || !priceUsd) {
      const historical = await fetchPriceAtUnix(timestampUnix);
      priceUsd = historical.usd;
      priceSource = historical.source;
    }

    priceUsd = roundPrice(priceUsd);
    const decision = decideSignal(
      classified,
      priceUsd,
      this.candles,
      this.thresholdBtc
    );

    const signal: WhaleSignal = {
      id: tx.txid,
      txid: tx.txid,
      timestamp: new Date(timestampUnix * 1000).toISOString(),
      timestampUnix,
      btcAmount: Number(totalBtc.toFixed(4)),
      movement: classified.movement,
      from: classified.from,
      to: classified.to,
      primaryFrom: classified.primaryFrom,
      primaryTo: classified.primaryTo,
      priceUsd,
      priceSource,
      signal: decision.signal,
      recommendation: decision.recommendation,
      keyLevel: decision.keyLevel,
      confirmed: Boolean(tx.status?.confirmed),
      blockHeight: tx.status?.block_height ?? null,
      explorerUrl: explorerTxUrl(tx.txid),
      seenIn,
    };

    this.signals.set(tx.txid, signal);
    if (this.signals.size > MAX_SIGNALS) {
      const ordered = [...this.signals.values()].sort(
        (a, b) => a.timestampUnix - b.timestampUnix
      );
      for (const old of ordered.slice(0, this.signals.size - MAX_SIGNALS)) {
        this.signals.delete(old.txid);
      }
    }

    this.log(formatAlertTerminal(signal));
    this.onSignal?.(signal);
  }
}

export function getEngine() {
  if (!globalStore.__whaleEngine) {
    globalStore.__whaleEngine = new WhaleEngine({
      log: (message) => {
        console.log(`[whale] ${message}`);
      },
    });
  }
  return globalStore.__whaleEngine;
}

export async function getSnapshot() {
  const engine = getEngine();
  await engine.start();
  return engine.snapshot();
}
