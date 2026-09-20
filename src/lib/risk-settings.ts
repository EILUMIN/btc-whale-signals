export type RiskSettings = {
  maxRiskUsd: number;
  maxDailyLossUsd: number;
  maxTradesPerDay: number;
  minRr: number;
  preferredRr: number;
  paperTrading: boolean;
  leverageWarn: number;
  signalExpirySec: number;
  futuresStaleSec: number;
  maxEntryDriftPct: number;
  minStopUsd: number;
};

function num(key: string, fallback: number) {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function flag(key: string, fallback: boolean) {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["0", "false", "off", "no"].includes(raw)) return false;
  if (["1", "true", "on", "yes"].includes(raw)) return true;
  return fallback;
}

/** Paper trading is on by default. No live order routing exists. */
export function loadRiskSettings(): RiskSettings {
  return {
    maxRiskUsd: num("MAX_RISK_USD", 10),
    maxDailyLossUsd: num("MAX_DAILY_LOSS_USD", 30),
    maxTradesPerDay: Math.max(1, Math.floor(num("MAX_TRADES_PER_DAY", 4))),
    minRr: num("MIN_RR", 1.5),
    preferredRr: num("PREFERRED_RR", 2),
    paperTrading: flag("PAPER_TRADING", true),
    leverageWarn: num("LEVERAGE_WARN", 10),
    signalExpirySec: num("SIGNAL_EXPIRY_SEC", 180),
    futuresStaleSec: num("FUTURES_STALE_SEC", 60),
    maxEntryDriftPct: num("MAX_ENTRY_DRIFT_PCT", 0.15),
    minStopUsd: num("MIN_STOP_USD", 15),
  };
}
