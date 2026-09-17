"use client";

import { WhaleAlertCard } from "@/components/whale-alert-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBtc, formatUsd, shortenAddress } from "@/lib/format";
import type { EngineSnapshot, SignalSide } from "@/lib/types";
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
  const [data, setData] = useState<EngineSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/signals", { cache: "no-store" });
        const json = (await response.json()) as EngineSnapshot;
        if (cancelled) return;
        if (!response.ok && !json.signals) {
          throw new Error(json.error || "Hindi makuha ang signals");
        }
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
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/signals", { cache: "no-store" });
      const json = (await response.json()) as EngineSnapshot;
      if (!response.ok && !json.signals) {
        throw new Error(json.error || "Hindi makuha ang signals");
      }
      setData(json);
      setError(json.error);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const signals = useMemo(() => {
    const rows = data?.signals ?? [];
    if (filter === "ALL") return rows;
    return rows.filter((row) => row.signal === filter);
  }, [data, filter]);

  const price = data?.price;
  const change = price?.change24hPct;
  const changeUp = (change ?? 0) >= 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
            Local BTC/USD desk
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Whale Signal Desk
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Real-time na 500+ BTC on-chain galaw mula sa Mempool.space, may
            presyo sa mismong oras ng transaksyon, at BUY/SELL recommendation.
            Ikaw lang ang makakakita nito — walang Telegram o Discord.
          </p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Live BTC/USD
          </p>
          {price ? (
            <>
              <p className="font-mono text-3xl font-semibold">
                {formatUsd(price.usd)}
              </p>
              <p className="text-xs text-muted-foreground">
                {price.source}
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
            <Skeleton className="mt-2 h-9 w-40" />
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Whale threshold"
          value={`${data?.thresholdBtc ?? 500} BTC`}
          hint="Binabantayan ang transaksyong higit sa 500 BTC"
        />
        <StatCard
          label="SELL / SHORT"
          value={String(data?.stats.sell ?? 0)}
          hint="Inflow papuntang exchange"
          tone="sell"
        />
        <StatCard
          label="BUY / ACCUMULATION"
          value={String(data?.stats.buy ?? 0)}
          hint="Outflow palabas ng exchange"
          tone="buy"
        />
        <StatCard
          label="Exchange wallets"
          value={String(data?.trackedWallets ?? 0)}
          hint={data?.liveFeed ? "Live mempool websocket" : "Polling mempool"}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-300">
          <Radio className="size-3" />
          {data?.liveFeed ? "Live feed connected" : "Connecting live feed"}
        </Badge>
        <span>
          Last scan:{" "}
          {data?.lastScanAt
            ? new Date(data.lastScanAt).toLocaleTimeString()
            : "pending"}
        </span>
        {updatedAt && <span>UI refresh: {new Date(updatedAt).toLocaleTimeString()}</span>}
        <Button size="sm" variant="ghost" onClick={() => void refresh()}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          I-scan ulit
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-500/10 shadow-none">
          <CardContent className="pt-1 text-sm text-red-200">
            May problema sa data feed: {error}. Patuloy ang retry.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium">Whale alerts</h2>
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
                <TabsTrigger value="ALL">Lahat</TabsTrigger>
                <TabsTrigger value="BUY">BUY</TabsTrigger>
                <TabsTrigger value="SELL">SELL</TabsTrigger>
                <TabsTrigger value="WATCH">WATCH</TabsTrigger>
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
                  Walang {data?.thresholdBtc ?? 500}+ BTC whale move sa ngayon
                </p>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Bihira ang 500 BTC na galaw. Naka-monitor ang mempool at mga
                  kilalang exchange wallets. Lalabas dito ang alert kapag
                  may dumating, kasama ang exact price level.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {signals.map((signal) => (
              <WhaleAlertCard key={signal.id} signal={signal} />
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Live tape</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Pinakamalalaking nakitang transaksyon sa latest scan — hindi
                ito automatic na BUY/SELL hangga&apos;t hindi umabot sa threshold.
              </p>
              {(data?.tape ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Naghihintay ng mempool prints…
                </p>
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
                        print.btc >= (data?.thresholdBtc ?? 500)
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
              <CardTitle className="text-sm">Paano binabasa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <ArrowDownToLine className="mt-0.5 size-4 text-red-400" />
                <span>
                  <strong className="text-foreground">Inflow</strong> papuntang
                  exchange → SELL / SHORT SETUP at resistance sa price level ng
                  transaksyon.
                </span>
              </p>
              <p className="flex gap-2">
                <ArrowUpFromLine className="mt-0.5 size-4 text-emerald-400" />
                <span>
                  <strong className="text-foreground">Outflow</strong> palabas ng
                  exchange papuntang wallet → BUY / ACCUMULATION at support sa
                  price level ng transaksyon.
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
