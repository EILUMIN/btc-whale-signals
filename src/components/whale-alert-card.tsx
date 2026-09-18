"use client";

import { useLanguage } from "@/components/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { interpolate, type Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  formatAlert,
  formatBtc,
  formatTimestamp,
  formatUsd,
  shortenAddress,
} from "@/lib/format";
import type { MovementKind, WhaleSignal } from "@/lib/types";
import { tradePlanFor } from "@/lib/trade-plan";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

function movementLabel(t: Dictionary, movement: MovementKind) {
  switch (movement) {
    case "Wallet to Exchange":
      return t.movementWalletToExchange;
    case "Exchange to Wallet":
      return t.movementExchangeToWallet;
    case "Exchange Internal":
      return t.movementExchangeInternal;
    default:
      return t.movementWalletToWallet;
  }
}

function noteForSignal(t: Dictionary, signal: WhaleSignal) {
  const vars = { threshold: 500 };
  switch (signal.keyLevel.noteKey) {
    case "inflow":
      return interpolate(t.noteInflow, vars);
    case "outflow":
      return interpolate(t.noteOutflow, vars);
    case "internal":
      return t.noteInternal;
    default:
      return t.noteUnlabeled;
  }
}

function addressLabel(t: Dictionary, label: string) {
  if (label === "Wallet / cold storage") return t.walletCold;
  if (label === "Unknown output") return t.unknownOutput;
  return label;
}

export function WhaleAlertCard({ signal }: { signal: WhaleSignal }) {
  const { language, t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const isSell = signal.signal === "SELL";
  const isBuy = signal.signal === "BUY";
  const accent = isSell
    ? "border-red-500/40 bg-red-500/5"
    : isBuy
      ? "border-emerald-500/40 bg-emerald-500/5"
      : "border-amber-500/30 bg-amber-500/5";
  const badgeClass = isSell
    ? "bg-red-500/15 text-red-300 border-red-500/30"
    : isBuy
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : "bg-amber-500/15 text-amber-200 border-amber-500/30";

  async function copyAlert() {
    await navigator.clipboard.writeText(formatAlert(signal, language));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card className={`border ${accent} shadow-none`}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-wide">
              🚨 BTC WHALE ALERT 🚨
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {signal.confirmed
                ? interpolate(t.confirmed, {
                    block: signal.blockHeight ?? "—",
                  })
                : t.unconfirmed}
            </p>
          </div>
          <Badge className={badgeClass} variant="outline">
            {signal.recommendation}
          </Badge>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.sizeAndMove}
            </dt>
            <dd>
              <span className="font-mono">{formatBtc(signal.btcAmount)}</span>
              <span className="text-muted-foreground">
                {" "}
                · {movementLabel(t, signal.movement)}
              </span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.signalRecommendation}
            </dt>
            <dd className="font-semibold">{signal.recommendation}</dd>
          </div>
        </dl>

        <TradeTicket signal={signal} t={t} />

        <LevelMap signal={signal} t={t} />

        <div className="grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3 text-xs sm:grid-cols-2">
          <AddressList title={t.from} rows={signal.from} t={t} />
          <AddressList title={t.to} rows={signal.to} t={t} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyAlert}>
            {copied ? <Check /> : <Copy />}
            {copied ? t.copied : t.copyAlert}
          </Button>
          <a
            href={signal.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <ExternalLink />
            Mempool.space
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function TradeTicket({
  signal,
  t,
}: {
  signal: WhaleSignal;
  t: Dictionary;
}) {
  const plan = tradePlanFor(signal);
  if (!plan) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
        {t.watchNotTrade}
      </div>
    );
  }
  const vars = {
    entry: formatUsd(plan.entry),
    exit: formatUsd(plan.exit),
    stop: formatUsd(plan.stop),
  };
  return (
    <div
      className={`space-y-3 rounded-xl border p-3 ${
        plan.side === "BUY"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider">
        {t.profitTarget}
      </p>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.entry}
          </dt>
          <dd className="font-mono text-xl font-semibold">
            {formatUsd(plan.entry)}
          </dd>
          <dd className="text-[11px] text-muted-foreground">
            {t.tradeWhen}: {formatTimestamp(plan.whenUnix)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.exit}
          </dt>
          <dd className="font-mono text-xl font-semibold text-emerald-300">
            {formatUsd(plan.exit)}
          </dd>
          <dd className="text-[11px] text-muted-foreground">+{plan.profitPct}%</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.stopLoss}
          </dt>
          <dd className="font-mono text-xl font-semibold text-red-300">
            {formatUsd(plan.stop)}
          </dd>
          <dd className="text-[11px] text-muted-foreground">{t.tradeAt}</dd>
        </div>
      </dl>
      <p className="text-sm leading-relaxed">
        {interpolate(plan.side === "BUY" ? t.buyPlan : t.sellPlan, vars)}
      </p>
      <p className="text-[11px] text-muted-foreground">{t.profitNote}</p>
    </div>
  );
}

function LevelMap({
  signal,
  t,
}: {
  signal: WhaleSignal;
  t: Dictionary;
}) {
  const placed = formatUsd(signal.priceUsd);
  const stop =
    signal.keyLevel.kind === "resistance"
      ? formatUsd(signal.keyLevel.zoneHigh)
      : signal.keyLevel.kind === "support"
        ? formatUsd(signal.keyLevel.zoneLow)
        : placed;
  const stopCopy =
    signal.keyLevel.kind === "resistance"
      ? interpolate(t.resistanceStops, { placed, stop })
      : signal.keyLevel.kind === "support"
        ? interpolate(t.supportStops, { placed, stop })
        : t.watchNoStop;
  const rangeLabel =
    signal.keyLevel.kind === "none"
      ? placed
      : `${formatUsd(signal.keyLevel.zoneLow)} → ${formatUsd(signal.keyLevel.zoneHigh)}`;

  return (
    <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
        {t.levelMap}
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.placedWhen}
          </dt>
          <dd className="font-mono text-xs sm:text-sm">
            {formatTimestamp(signal.timestampUnix)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.placedAt}
          </dt>
          <dd className="font-mono text-base font-semibold">{placed}</dd>
          <dd className="text-[11px] text-muted-foreground">{signal.priceSource}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.stopsAt}
          </dt>
          <dd className="font-mono text-base font-semibold">{stop}</dd>
          <dd className="text-[11px] text-muted-foreground">
            {signal.keyLevel.kind === "resistance"
              ? t.estimatedResistance
              : signal.keyLevel.kind === "support"
                ? t.estimatedSupport
                : t.keyLevel}
          </dd>
        </div>
      </dl>
      <p className="font-mono text-xs text-muted-foreground">
        {t.zone}: {rangeLabel}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{stopCopy}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {noteForSignal(t, signal)}
      </p>
    </div>
  );
}

function AddressList({
  title,
  rows,
  t,
}: {
  title: string;
  rows: WhaleSignal["from"];
  t: Dictionary;
}) {
  return (
    <div>
      <p className="mb-2 font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {rows.slice(0, 4).map((row) => (
          <li key={`${title}-${row.address}`} className="leading-snug">
            <span className="font-medium text-foreground">
              {addressLabel(t, row.label)}
            </span>
            <span className="block font-mono text-muted-foreground">
              {shortenAddress(row.address)} · {formatBtc(row.btc)}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground">{t.noAddress}</li>
        )}
      </ul>
    </div>
  );
}
