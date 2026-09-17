"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatAlert,
  formatBtc,
  formatTimestamp,
  formatUsd,
  shortenAddress,
} from "@/lib/format";
import type { WhaleSignal } from "@/lib/types";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

export function WhaleAlertCard({ signal }: { signal: WhaleSignal }) {
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
    await navigator.clipboard.writeText(formatAlert(signal));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const levelLabel =
    signal.keyLevel.kind === "resistance"
      ? "Tinatayang Resistance"
      : signal.keyLevel.kind === "support"
        ? "Tinatayang Support"
        : "Key Level";

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
                ? `Confirmed · block ${signal.blockHeight ?? "—"}`
                : "Unconfirmed · mempool"}
            </p>
          </div>
          <Badge className={badgeClass} variant="outline">
            {signal.recommendation}
          </Badge>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Oras (Timestamp)
            </dt>
            <dd className="font-mono">{formatTimestamp(signal.timestampUnix)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Dami at Galaw
            </dt>
            <dd>
              <span className="font-mono">{formatBtc(signal.btcAmount)}</span>
              <span className="text-muted-foreground"> · {signal.movement}</span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Price Level
            </dt>
            <dd className="font-mono">
              {formatUsd(signal.priceUsd)}
              <span className="ml-2 text-xs text-muted-foreground">
                {signal.priceSource}
              </span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              Signal Recommendation
            </dt>
            <dd className="font-semibold">{signal.recommendation}</dd>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {levelLabel}
            </dt>
            <dd className="font-mono">
              {formatUsd(signal.keyLevel.price)}
              {signal.keyLevel.kind !== "none" && (
                <span className="ml-2 text-xs text-muted-foreground">
                  zone {formatUsd(signal.keyLevel.zoneLow)} –{" "}
                  {formatUsd(signal.keyLevel.zoneHigh)}
                </span>
              )}
            </dd>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {signal.keyLevel.note}
            </p>
          </div>
        </dl>

        <div className="grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3 text-xs sm:grid-cols-2">
          <AddressList title="Mula (from)" rows={signal.from} />
          <AddressList title="Papunta (to)" rows={signal.to} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyAlert}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy alert"}
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

function AddressList({
  title,
  rows,
}: {
  title: string;
  rows: WhaleSignal["from"];
}) {
  return (
    <div>
      <p className="mb-2 font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {rows.slice(0, 4).map((row) => (
          <li key={`${title}-${row.address}`} className="leading-snug">
            <span className="font-medium text-foreground">{row.label}</span>
            <span className="block font-mono text-muted-foreground">
              {shortenAddress(row.address)} · {formatBtc(row.btc)}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground">Walang address data</li>
        )}
      </ul>
    </div>
  );
}
