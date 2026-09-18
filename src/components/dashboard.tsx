"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { WhaleAlertCard } from "@/components/whale-alert-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/components/language-provider";
import { interpolate } from "@/lib/i18n";
import { formatBtc, formatTimestamp, formatUsd, shortenAddress } from "@/lib/format";
import type { EngineSnapshot, LivePrice, SignalSide } from "@/lib/types";
import { priceApiUrl, signalsApiUrl } from "@/lib/urls";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Radio,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Filter = "ALL" | SignalSide;

export function Dashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState<EngineSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const loadSignals = useCallback(async () => {
    const response = await fetch(signalsApiUrl(), { cache: "no-store" });
    const json = (await response.json()) as EngineSnapshot;
    if (!response.ok && !json.signals) {
      throw new Error(json.error || t.fetchError);
    }
    return json;
  }, [t.fetchError]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const json = await loadSignals();
        if (cancelled) return;
        setData(json);
        setError(json.error);
        setUpdatedAt(new Date().toISOString());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadSignals]);

  useEffect(() => {
    let cancelled = false;
    const tickPrice = async () => {
      try {
        const response = await fetch(priceApiUrl(), { cache: "no-store" });
        const json = (await response.json()) as LivePrice & { error?: string };
        if (cancelled) return;
        if (typeof json.usd === "number" && json.usd > 0) {
          setLivePrice(json);
          setPriceError(null);
        } else {
          setPriceError(json.error || t.fetchError);
        }
      } catch (err) {
        if (cancelled) return;
        setPriceError(err instanceof Error ? err.message : String(err));
      }
    };
    void tickPrice();
    const timer = setInterval(() => {
      void tickPrice();
    }, 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [t.fetchError]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const json = await loadSignals();
      setData(json);
      setError(json.error);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadSignals]);

  const signals = useMemo(() => {
    const rows = data?.signals ?? [];
    if (filter === "ALL") {
      return rows.filter((row) => row.signal === "BUY" || row.signal === "SELL");
    }
    return rows.filter((row) => row.signal === filter);
  }, [data, filter]);

  const price = livePrice ?? data?.price;
  const change = price?.change24hPct;
  const changeUp = (change ?? 0) >= 0;
  const threshold = data?.thresholdBtc ?? 500;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
            {t.eyebrow}
          </p>
          <LanguageToggle />
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {t.title}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{t.subtitle}</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-card px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.livePrice}
            </p>
            {price ? (
              <>
                <p className="font-mono text-3xl font-semibold">
                  {formatUsd(price.usd)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {price.source} · {t.liveTick}{" "}
                  {formatTimestamp(Math.floor(new Date(price.timestamp).getTime() / 1000))}
                  {change !== null && change !== undefined && (
                    <span
                      className={
                        changeUp ? " ml-2 text-emerald-400" : " ml-2 text-red-400"
                      }
                    >
                      {changeUp ? "+" : ""}
                      {change.toFixed(2)}% 24h
                    </span>
                  )}
                </p>
              </>
            ) : (
              <>
                <Skeleton className="mt-2 h-9 w-40" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.priceRefreshing}
                </p>
              </>
            )}
            {priceError && (
              <p className="mt-1 text-[11px] text-red-300">{priceError}</p>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t.whaleThreshold}
          value={`${threshold} BTC`}
          hint={interpolate(t.whaleThresholdHint, { threshold })}
        />
        <StatCard
          label={t.sellShort}
          value={String(data?.stats.sell ?? 0)}
          hint={t.sellHint}
          tone="sell"
        />
        <StatCard
          label={t.buyAccum}
          value={String(data?.stats.buy ?? 0)}
          hint={t.buyHint}
          tone="buy"
        />
        <StatCard
          label={t.exchangeWallets}
          value={String(data?.trackedWallets ?? 0)}
          hint={data?.liveFeed ? t.liveWebsocket : t.pollingMempool}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-300">
          <Radio className="size-3" />
          {data?.liveFeed ? t.liveFeedConnected : t.connectingLiveFeed}
        </Badge>
        <span>
          {t.lastScan}:{" "}
          {data?.lastScanAt
            ? new Date(data.lastScanAt).toLocaleTimeString()
            : t.pending}
        </span>
        {updatedAt && (
          <span>
            {t.uiRefresh}: {new Date(updatedAt).toLocaleTimeString()}
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          {t.rescan}
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-500/10 shadow-none">
          <CardContent className="pt-1 text-sm text-red-200">
            {interpolate(t.feedError, { error })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium">{t.whaleAlerts}</h2>
            <Tabs
              value={filter}
              onValueChange={(value) => {
                if (
                  value === "ALL" ||
                  value === "BUY" ||
                  value === "SELL" ||
                  value === "WATCH"
                ) {
                  setFilter(value);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="ALL">{t.tabAll}</TabsTrigger>
                <TabsTrigger value="BUY">BUY</TabsTrigger>
                <TabsTrigger value="SELL">SELL</TabsTrigger>
                <TabsTrigger value="WATCH">{t.tabWatch}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading && !data && (
            <div className="space-y-3">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}

          {!loading && signals.length === 0 && (
            <Card className="border-dashed shadow-none">
              <CardContent className="space-y-2 py-10 text-center">
                <Activity className="mx-auto size-8 text-amber-400" />
                <p className="font-medium">
                  {interpolate(t.emptyTitle, { threshold })}
                </p>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  {interpolate(t.emptyBody, { threshold })}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {signals.map((signal) => (
              <WhaleAlertCard
                key={signal.id}
                signal={signal}
                livePriceUsd={price?.usd}
              />
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">{t.liveTape}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{t.liveTapeHint}</p>
              {(data?.tape ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t.waitingTape}</p>
              )}
              <ul className="space-y-2">
                {(data?.tape ?? []).slice(0, 10).map((print) => (
                  <li
                    key={print.txid}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 font-mono text-xs"
                  >
                    <span>{shortenAddress(print.txid)}</span>
                    <span
                      className={
                        print.btc >= threshold
                          ? "text-amber-300"
                          : "text-muted-foreground"
                      }
                    >
                      {formatBtc(print.btc)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">{t.howToRead}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <ArrowDownToLine className="mt-0.5 size-4 text-red-400" />
                <span>
                  <strong className="text-foreground">{t.inflow}</strong>
                  {` ${t.inflowExplain}`}
                </span>
              </p>
              <p className="flex gap-2">
                <ArrowUpFromLine className="mt-0.5 size-4 text-emerald-400" />
                <span>
                  <strong className="text-foreground">{t.outflow}</strong>
                  {` ${t.outflowExplain}`}
                </span>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "buy" | "sell";
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="space-y-1 pt-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={`font-mono text-2xl font-semibold ${
            tone === "buy"
              ? "text-emerald-400"
              : tone === "sell"
                ? "text-red-400"
                : ""
          }`}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
