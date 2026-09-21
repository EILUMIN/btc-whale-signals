import { postDiscord } from "@/lib/signal-alert";
import type { PossibleEntrySignal } from "@/lib/possible-entry";
import type { M1Snapshot } from "@/lib/m1";

const COOLDOWN_MS = 30 * 60_000;

type Latch = {
  key: string | null;
  at: number;
};

const g = globalThis as unknown as { __possibleEntryLatch?: Latch };

function latch(): Latch {
  if (!g.__possibleEntryLatch) g.__possibleEntryLatch = { key: null, at: 0 };
  return g.__possibleEntryLatch;
}

export function possibleEntryAlertKey(signal: PossibleEntrySignal): string | null {
  if (signal.status !== "POSSIBLE LONG" && signal.status !== "POSSIBLE SHORT") {
    return null;
  }
  const zone = signal.entryLow !== null ? Math.round(signal.entryLow / 50) * 50 : 0;
  return `${signal.status}:${zone}`;
}

export function shouldSendPossibleEntryAlert(
  signal: PossibleEntrySignal,
  nowMs = Date.now(),
  state: Latch = latch()
): boolean {
  const key = possibleEntryAlertKey(signal);
  if (!key) return false;
  if (state.key === key && nowMs - state.at < COOLDOWN_MS) return false;
  return true;
}

export function formatPossibleEntryDiscord(signal: PossibleEntrySignal): string {
  const money = (n: number | null) =>
    n === null
      ? "—"
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    `${signal.status} — BTCUSD chart entry (alert only, not an order)`,
    `Entry zone: ${money(signal.entryLow)} – ${money(signal.entryHigh)}`,
    `Stop-loss/invalidation: ${money(signal.stop)}`,
    `TP1: ${money(signal.tp1)}`,
    `TP2: ${money(signal.tp2)}`,
    `Risk/reward: ${signal.rr !== null ? `1:${signal.rr.toFixed(2)}` : "—"}`,
    `Confidence: ${signal.confidence}`,
    `Timeframe: ${signal.timeframe}`,
    `Reason: ${signal.reason}`,
    `Whale confirmation: ${signal.whaleConfirmation}`,
    `When: ${signal.timestamp}`,
    "",
    "Labeled flow is optional confirmation only. Aggregated inflow is not one whale or institution.",
    "Not financial advice. Signal-only desk.",
  ].join("\n");
}

export async function applyPossibleEntryAlert(
  snap: M1Snapshot,
  nowMs = Date.now()
): Promise<M1Snapshot> {
  const signal = snap.possibleEntry;
  if (!signal) return snap;
  if (!shouldSendPossibleEntryAlert(signal, nowMs)) {
    return {
      ...snap,
      possibleEntryDiscord: "idle",
      possibleEntryDiscordDetail: "",
    };
  }
  const text = formatPossibleEntryDiscord(signal);
  const hook = await postDiscord(`${signal.status}\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\``);
  const state = latch();
  const key = possibleEntryAlertKey(signal);
  if (key && hook.status === "sent") {
    state.key = key;
    state.at = nowMs;
  } else if (key && hook.status === "skipped") {
    state.key = key;
    state.at = nowMs;
  }
  return {
    ...snap,
    possibleEntryDiscord: hook.status,
    possibleEntryDiscordDetail: hook.detail,
  };
}

export function resetPossibleEntryLatch() {
  g.__possibleEntryLatch = { key: null, at: 0 };
}
