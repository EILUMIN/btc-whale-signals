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

export function formatAlert(
  signal: WhaleSignal,
  language: Language = "fil"
) {
  const t = dictionaries[language];
  const fromLabel = signal.primaryFrom.entity
    ? signal.primaryFrom.entity
    : "Wallet";
  const toLabel = signal.primaryTo.entity ? signal.primaryTo.entity : "Wallet";
  return [
    "🚨 BTC WHALE ALERT 🚨",
    `${t.m1Signal}: ${signal.recommendation}`,
    `${formatBtc(signal.btcAmount)} · ${signal.movement} (${fromLabel} → ${toLabel})`,
    `${t.livePrice}: ${formatUsd(signal.priceUsd)}`,
    `${t.candle}: ${formatTimestamp(signal.timestampUnix)}`,
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
    `${ANSI.dim}Time:${ANSI.reset} ${formatTimestamp(signal.timestampUnix)}`,
    `${ANSI.dim}Size:${ANSI.reset} ${formatBtc(signal.btcAmount)} · ${signal.movement}`,
    `${ANSI.dim}Price:${ANSI.reset} ${formatUsd(signal.priceUsd)} (${signal.priceSource})`,
    `${ANSI.dim}Signal:${ANSI.reset} ${color}${ANSI.bold}${signal.recommendation}${ANSI.reset}`,
    `${ANSI.cyan}Tx:${ANSI.reset} ${signal.explorerUrl}`,
  ].join("\n");
}
