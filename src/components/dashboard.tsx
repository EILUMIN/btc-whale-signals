"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { M1Chart } from "@/components/m1-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/language-provider";
import { interpolate, type Dictionary } from "@/lib/i18n";
import { formatBtc, formatTimestamp, formatUsd } from "@/lib/format";
import type { M1Snapshot, RiskPlan, WhaleWall } from "@/lib/m1";
import { matrixApiUrl, priceApiUrl } from "@/lib/urls";
import type { LivePrice } from "@/lib/types";
import { Radio, RefreshCw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

function playSignalPing() {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
  osc.onended = () => {
    void ctx.close();
  };
}

export function Dashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState<M1Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const lastPingCandle = useRef<number | null>(null);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch(matrixApiUrl(), { cache: "no-store" });
    const json = (await response.json()) as M1Snapshot;
    if (!response.ok && !json.ok) {
      throw new Error(json.error || t.fetchError);
    }
    return json;
  }, [t.fetchError]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const json = await loadSnapshot();
        if (cancelled) return;
        setData(json);
        setError(json.error);
        setUpdatedAt(new Date().toISOString());
        const pingThisCandle =
          Boolean(json.alertPing) &&
          (json.signal === "BUY" || json.signal === "SELL") &&
          lastPingCandle.current !== json.candleKey;
        if (pingThisCandle) {
          lastPingCandle.current = json.candleKey;
          try {
            playSignalPing();
          } catch {
            // autoplay may need a click
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadSnapshot]);

  useEffect(() => {
    const unlock = () => {
      setSoundReady(true);
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          void ctx.resume().finally(() => {
            void ctx.close();
          });
        }
      } catch {
        // ignore
      }
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tickPrice = async () => {
      try {
        const response = await fetch(priceApiUrl(), { cache: "no-store" });
        const json = (await response.json()) as LivePrice;
        if (!cancelled && typeof json.usd === "number" && json.usd > 0) {
          setLivePrice(json);
        }
      } catch {
        // VWAP remains the trade clock
      }
    };
    void tickPrice();
    const timer = setInterval(() => void tickPrice(), 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const json = await loadSnapshot();
      setData(json);
      setError(json.error);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadSnapshot]);

  const headerPrice = livePrice?.usd ?? data?.live_price ?? data?.live_vwap ?? 0;
  const signal = data?.signal ?? "WAIT";

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
            {headerPrice ? (
              <>
                <p className="font-mono text-3xl font-semibold">
                  {formatUsd(headerPrice)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {livePrice?.source ?? data?.source} · {t.liveTick}{" "}
                  {formatTimestamp(
                    Math.floor(
                      new Date(
                        livePrice?.timestamp ?? data?.scannedAt ?? 0
                      ).getTime() / 1000
                    )
                  )}
                </p>
              </>
            ) : (
              <Skeleton className="mt-2 h-9 w-40" />
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t.liveCvd}
          value={data ? data.cvd.toFixed(2) : "—"}
          hint={data?.cvdLabel ?? t.waitHint}
          tone={
            (data?.cvd ?? 0) > 0 ? "buy" : (data?.cvd ?? 0) < 0 ? "sell" : undefined
          }
        />
        <StatCard
          label={t.liveVwap}
          value={data ? formatUsd(data.live_vwap) : "—"}
          hint={data?.source ?? t.venues}
        />
        <StatCard
          label={t.onchainIn}
          value={data ? formatBtc(data.flow.inflows) : "—"}
          hint={t.sellHint}
          tone={(data?.flow.inflows ?? 0) >= 500 ? "sell" : undefined}
        />
        <StatCard
          label={t.m1Signal}
          value={signal}
          hint={
            signal === "SELL"
              ? t.sellHint
              : signal === "BUY"
                ? t.buyHint
                : t.waitHint
          }
          tone={
            signal === "BUY" ? "buy" : signal === "SELL" ? "sell" : undefined
          }
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/30 text-emerald-300"
        >
          <Radio className="size-3" />
          {data?.source || t.connectingLiveFeed}
        </Badge>
        <Badge variant="outline">{t.m1Label}</Badge>
        <Badge variant="outline" className="gap-1">
          <Volume2 className="size-3" />
          {soundReady ? t.soundReady : t.emailIdle}
        </Badge>
        {data?.emailStatus === "sent" && (
          <span className="text-emerald-300">
            {interpolate(t.emailSent, { to: "elmer.whaledesk@gmail.com" })}
          </span>
        )}
        {data?.emailStatus === "skipped" && (
          <span className="text-amber-300">{t.emailSkipped}</span>
        )}
        {data?.emailStatus === "failed" && (
          <span className="text-red-300">
            {interpolate(t.emailFailed, { detail: data.emailDetail ?? "" })}
          </span>
        )}
        {data?.spoofChecked && data.spoofCleared && (
          <span className="text-emerald-300">{t.spoofOk}</span>
        )}
        {data?.spoofChecked && !data.spoofCleared && (
          <span className="text-amber-300">{t.spoofFail}</span>
        )}
        <span>
          {t.lastScan}:{" "}
          {data?.scannedAt
            ? new Date(data.scannedAt).toLocaleTimeString()
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

      {loading && !data && (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="space-y-4">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{t.chartTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <M1Chart
                  bars={data.bars}
                  walls={data.walls}
                  live={livePrice?.usd ?? data.live_price}
                  vwap={data.live_vwap}
                  entry={data.armedPlan?.entry}
                  stop={data.armedPlan?.stop}
                  takeProfit={data.armedPlan?.takeProfit}
                />
                <p className="text-xs text-muted-foreground">{t.chartHint}</p>
              </CardContent>
            </Card>
            <ArmedTicket data={data} t={t} />
            <WallList walls={data.walls} t={t} />
          </section>
          <aside className="space-y-4">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{t.venues}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data.venues.map((venue) => (
                  <div
                    key={venue.name}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <span className="font-medium">{venue.name}</span>
                    {venue.ok ? (
                      <span className="font-mono text-xs">
                        {formatUsd(venue.last)}
                      </span>
                    ) : (
                      <span className="text-xs text-red-300">offline</span>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  {t.onchainOut}: {formatBtc(data.flow.outflows)}
                </p>
              </CardContent>
            </Card>
            <FlowTape data={data} t={t} />
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{t.howToRead}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{t.inflowExplain}</p>
                <p>{t.outflowExplain}</p>
                <p>{t.spoofExplain}</p>
                <p>{t.profitNote}</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function ArmedTicket({ data, t }: { data: M1Snapshot; t: Dictionary }) {
  const plan = data.armedPlan;
  if (!plan || (data.signal !== "BUY" && data.signal !== "SELL")) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/10 shadow-none">
        <CardContent className="space-y-2 pt-1">
          <p className="text-sm font-semibold">{t.waiting}</p>
          <p className="text-sm text-muted-foreground">{data.recommendation}</p>
        </CardContent>
      </Card>
    );
  }
  const vars = {
    entry: formatUsd(plan.entry),
    exit: formatUsd(plan.takeProfit),
    stop: formatUsd(plan.stop),
  };
  const sell = plan.side === "SELL";
  return (
    <Card
      className={`shadow-none ${
        sell
          ? "border-red-500/40 bg-red-500/10"
          : "border-emerald-500/40 bg-emerald-500/10"
      }`}
    >
      <CardContent className="space-y-3 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.armed} · {plan.side}
          </p>
          <p className="text-sm font-semibold">
            {interpolate(sell ? t.sellNow : t.buyNow, {
              entry: formatUsd(plan.entry),
            })}
          </p>
        </div>
        <PlanGrid plan={plan} t={t} />
        <p className="text-sm">
          {interpolate(sell ? t.sellPlan : t.buyPlan, vars)}
        </p>
        <p className="text-[11px] text-muted-foreground">{t.profitNote}</p>
      </CardContent>
    </Card>
  );
}

function WallList({ walls, t }: { walls: WhaleWall[]; t: Dictionary }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{t.wallsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {walls.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.wallsEmpty}</p>
        )}
        {walls.slice(0, 8).map((wall) => (
          <div
            key={`${wall.side}-${wall.price}`}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
              wall.side === "ask"
                ? "border-red-500/30 bg-red-500/5"
                : "border-emerald-500/30 bg-emerald-500/5"
            }`}
          >
            <div>
              <p className="font-medium">
                {wall.whale ? t.whaleWall : t.notableWall} ·{" "}
                {wall.side === "ask" ? t.asks : t.bids}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatUsd(wall.priceLow)} – {formatUsd(wall.priceHigh)} ·{" "}
                {wall.venues.join(", ")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono font-semibold">{formatUsd(wall.price)}</p>
              <p className="text-xs text-muted-foreground">
                {formatBtc(wall.btc)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FlowTape({ data, t }: { data: M1Snapshot; t: Dictionary }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{t.flowTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.flow.prints.length === 0 && (
          <p className="text-muted-foreground">{t.flowEmpty}</p>
        )}
        {data.flow.prints.slice(0, 8).map((print) => (
          <div
            key={print.txid}
            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
          >
            <span
              className={
                print.kind === "inflow"
                  ? "text-red-300"
                  : print.kind === "outflow"
                    ? "text-emerald-300"
                    : "text-muted-foreground"
              }
            >
              {print.kind === "inflow"
                ? t.inflow
                : print.kind === "outflow"
                  ? t.outflow
                  : print.kind}
            </span>
            <span className="font-mono text-xs">{formatBtc(print.btc)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PlanGrid({ plan, t }: { plan: RiskPlan; t: Dictionary }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
          {t.entryVwap}
        </dt>
        <dd className="font-mono text-xl font-semibold">
          {formatUsd(plan.entry)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
          {t.exitRr}
        </dt>
        <dd className="font-mono text-xl font-semibold text-emerald-300">
          {formatUsd(plan.takeProfit)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
          {t.stopWall}
        </dt>
        <dd className="font-mono text-xl font-semibold text-red-300">
          {formatUsd(plan.stop)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
          {t.sizeBtc}
        </dt>
        <dd className="font-mono text-xl font-semibold">
          {formatBtc(plan.sizeBtc)}
        </dd>
        <dd className="text-[11px] text-muted-foreground">
          {t.riskUsd} {formatUsd(plan.riskUsd)} · {t.notional}{" "}
          {formatUsd(plan.notionalUsd)}
        </dd>
      </div>
    </dl>
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
