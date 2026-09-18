import { dictionaries, type Language } from "@/lib/i18n";
import type { WhaleSignal } from "@/lib/types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatTimestamp(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

export function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBtc(value: number) {
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} BTC`;
}

export function shortenAddress(address: string) {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function formatAlert(signal: WhaleSignal, language: Language = "fil") {
  const t = dictionaries[language];
  const levelLine =
    signal.keyLevel.kind === "resistance"
      ? `${t.estimatedResistance}: ${formatUsd(signal.keyLevel.price)} (${t.zone} ${formatUsd(signal.keyLevel.zoneLow)} – ${formatUsd(signal.keyLevel.zoneHigh)})`
      : signal.keyLevel.kind === "support"
        ? `${t.estimatedSupport}: ${formatUsd(signal.keyLevel.price)} (${t.zone} ${formatUsd(signal.keyLevel.zoneLow)} – ${formatUsd(signal.keyLevel.zoneHigh)})`
        : `${t.keyLevel}: ${formatUsd(signal.keyLevel.price)}`;

  const fromLabel = signal.primaryFrom.entity
    ? signal.primaryFrom.entity
    : "Wallet";
  const toLabel = signal.primaryTo.entity ? signal.primaryTo.entity : "Wallet";

  return [
    "🚨 BTC WHALE ALERT 🚨",
    `${t.timestamp}: ${formatTimestamp(signal.timestampUnix)}`,
    `${t.sizeAndMove}: ${formatBtc(signal.btcAmount)} · ${signal.movement} (${fromLabel} → ${toLabel})`,
    `${t.priceLevel}: ${formatUsd(signal.priceUsd)}`,
    `${t.signalRecommendation}: ${signal.recommendation}`,
    levelLine,
  ].join("\n");
}

const ANSI = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

export function formatAlertTerminal(signal: WhaleSignal) {
  const color =
    signal.signal === "SELL"
      ? ANSI.red
      : signal.signal === "BUY"
        ? ANSI.green
        : ANSI.yellow;
  return [
    `${color}${ANSI.bold}🚨 BTC WHALE ALERT 🚨${ANSI.reset}`,
    `${ANSI.dim}Oras (Timestamp):${ANSI.reset} ${formatTimestamp(signal.timestampUnix)}`,
    `${ANSI.dim}Dami at Galaw:${ANSI.reset} ${formatBtc(signal.btcAmount)} · ${signal.movement}`,
    `${ANSI.dim}Price Level:${ANSI.reset} ${formatUsd(signal.priceUsd)} (${signal.priceSource})`,
    `${ANSI.dim}Signal Recommendation:${ANSI.reset} ${color}${ANSI.bold}${signal.recommendation}${ANSI.reset}`,
    signal.keyLevel.kind === "resistance"
      ? `${ANSI.dim}Tinatayang Resistance:${ANSI.reset} ${formatUsd(signal.keyLevel.price)}`
      : signal.keyLevel.kind === "support"
        ? `${ANSI.dim}Tinatayang Support:${ANSI.reset} ${formatUsd(signal.keyLevel.price)}`
        : `${ANSI.dim}Key Level:${ANSI.reset} ${formatUsd(signal.keyLevel.price)}`,
    `${ANSI.cyan}Tx:${ANSI.reset} ${signal.explorerUrl}`,
  ].join("\n");
}
