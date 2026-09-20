import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PrecisionDirection, PrecisionPlan } from "@/lib/precision";
import { loadRiskSettings } from "@/lib/risk-settings";

export type PaperFill = {
  id: string;
  candleKey: number;
  direction: PrecisionDirection;
  waitReason: string;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  result: "open" | "tp1" | "tp2" | "stop" | "expired" | "wait" | "blocked";
  rMultiple: number;
  feesUsd: number;
  slippageUsd: number;
  at: string;
  reason: string;
};

export type PaperStats = {
  paperTrading: boolean;
  decisions: number;
  longs: number;
  shorts: number;
  waits: number;
  blocked: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
  maxDrawdownR: number;
  losingStreak: number;
  falseSignals: number;
  tradesToday: number;
  dailyLossUsd: number;
  open: PaperFill | null;
};

type State = {
  fills: PaperFill[];
  open: PaperFill | null;
  blocked: number;
  falseSignals: number;
};

const g = globalThis as unknown as { __paperState?: State };
const FEE_BPS = 4;
const SLIP_BPS = 3;

function filePath() {
  return resolve(process.cwd(), "data", "paper-journal.json");
}

function loadState(): State {
  if (g.__paperState) return g.__paperState;
  const path = filePath();
  if (existsSync(path)) {
    try {
      g.__paperState = JSON.parse(readFileSync(path, "utf8")) as State;
      return g.__paperState;
    } catch {
      // start clean
    }
  }
  g.__paperState = { fills: [], open: null, blocked: 0, falseSignals: 0 };
  return g.__paperState;
}

function persist(state: State) {
  g.__paperState = state;
  try {
    const path = filePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2));
  } catch {
    // ephemeral is still enough for the running desk
  }
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

export function paperStats(now = new Date().toISOString()): PaperStats {
  const state = loadState();
  const today = dayKey(now);
  const closed = state.fills.filter((row) => row.direction !== "WAIT");
  const wins = closed.filter((row) => row.rMultiple > 0).length;
  const losses = closed.filter((row) => row.rMultiple < 0).length;
  const rs = closed.map((row) => row.rMultiple);
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  let streak = 0;
  let worstStreak = 0;
  for (const row of closed) {
    equity += row.rMultiple;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    if (row.rMultiple < 0) {
      streak += 1;
      worstStreak = Math.max(worstStreak, streak);
    } else if (row.rMultiple > 0) {
      streak = 0;
    }
  }
  const todayFills = closed.filter((row) => dayKey(row.at) === today);
  const dailyLossUsd = todayFills
    .filter((row) => row.result === "stop")
    .reduce((sum, row) => sum + Math.abs(row.rMultiple) * loadRiskSettings().maxRiskUsd, 0);
  return {
    paperTrading: loadRiskSettings().paperTrading,
    decisions: state.fills.length,
    longs: closed.filter((row) => row.direction === "LONG").length,
    shorts: closed.filter((row) => row.direction === "SHORT").length,
    waits: state.fills.filter((row) => row.direction === "WAIT").length,
    blocked: state.blocked,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    maxDrawdownR: maxDd,
    losingStreak: worstStreak,
    falseSignals: state.falseSignals,
    tradesToday: todayFills.length,
    dailyLossUsd,
    open: state.open,
  };
}

export function recordPrecisionDecision(input: {
  candleKey: number;
  direction: PrecisionDirection;
  waitReason: string;
  plan: PrecisionPlan | null;
  live: number;
}): PaperStats {
  const state = loadState();
  const now = new Date().toISOString();
  const last = state.fills.at(-1);
  const sameWait =
    input.direction === "WAIT" &&
    last &&
    last.direction === "WAIT" &&
    last.candleKey === input.candleKey &&
    last.waitReason === input.waitReason;
  if (sameWait) return paperStats(now);

  if (input.direction === "WAIT" && input.waitReason.startsWith("WAIT —")) {
    state.blocked += 1;
  }

  if (state.open && input.plan) {
    // one active paper trade at a time
    return paperStats(now);
  }

  const fee = input.plan
    ? (input.plan.notionalUsd * FEE_BPS) / 10_000
    : 0;
  const slip = input.plan
    ? (input.plan.notionalUsd * SLIP_BPS) / 10_000
    : 0;
  const fill: PaperFill = {
    id: `${input.candleKey}-${input.direction}-${now}`,
    candleKey: input.candleKey,
    direction: input.direction,
    waitReason: input.waitReason,
    entry: input.plan?.entry ?? null,
    stop: input.plan?.stop ?? null,
    tp1: input.plan?.tp1 ?? null,
    tp2: input.plan?.tp2 ?? null,
    result: input.direction === "WAIT" ? "wait" : "open",
    rMultiple: 0,
    feesUsd: fee,
    slippageUsd: slip,
    at: now,
    reason: input.plan?.reason || input.waitReason,
  };
  state.fills.push(fill);
  if (fill.result === "open") state.open = fill;
  persist(state);
  return paperStats(now);
}

export function markToMarket(live: number, nowMs = Date.now()): PaperStats {
  const state = loadState();
  const open = state.open;
  if (!open || open.entry === null || open.stop === null) {
    return paperStats();
  }
  const risk = Math.abs(open.entry - open.stop) || 1;
  let result: PaperFill["result"] | null = null;
  let r = 0;
  if (open.direction === "LONG") {
    if (live <= open.stop) {
      result = "stop";
      r = -1;
      state.falseSignals += 1;
    } else if (open.tp2 !== null && live >= open.tp2) {
      result = "tp2";
      r = Math.abs(open.tp2 - open.entry) / risk;
    } else if (open.tp1 !== null && live >= open.tp1) {
      result = "tp1";
      r = Math.abs(open.tp1 - open.entry) / risk;
    }
  } else if (open.direction === "SHORT") {
    if (live >= open.stop) {
      result = "stop";
      r = -1;
      state.falseSignals += 1;
    } else if (open.tp2 !== null && live <= open.tp2) {
      result = "tp2";
      r = Math.abs(open.entry - open.tp2) / risk;
    } else if (open.tp1 !== null && live <= open.tp1) {
      result = "tp1";
      r = Math.abs(open.entry - open.tp1) / risk;
    }
  }
  const expiry = Date.parse(
    state.fills.find((row) => row.id === open.id)?.at ?? ""
  );
  if (!result && Number.isFinite(expiry)) {
    const settings = loadRiskSettings();
    if (nowMs - expiry > settings.signalExpirySec * 1000) {
      result = "expired";
      r = 0;
    }
  }
  if (result) {
    open.result = result;
    open.rMultiple = Math.round((r - (open.feesUsd + open.slippageUsd) / (loadRiskSettings().maxRiskUsd || 10)) * 1000) / 1000;
    state.open = null;
    persist(state);
  }
  return paperStats();
}

export function resetPaperJournal() {
  g.__paperState = { fills: [], open: null, blocked: 0, falseSignals: 0 };
  persist(g.__paperState);
}
