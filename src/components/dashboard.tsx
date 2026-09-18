"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/language-provider";
import { interpolate, type Dictionary } from "@/lib/i18n";
import { formatBtc, formatTimestamp, formatUsd } from "@/lib/format";
import type { MatrixSnapshot, RiskPlan } from "@/lib/matrix";
import { matrixApiUrl, priceApiUrl } from "@/lib/urls";
import type { LivePrice } from "@/lib/types";
import { Radio, RefreshCw, ShieldAlert, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

function playSellPing() {
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
  const [data, setData] = useState<MatrixSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const prevSignal = useRef<string>("WAIT");

  const loadMatrix = useCallback(async () => {
    const response = await fetch(matrixApiUrl(), { cache: "no-store" });
    const json = (await response.json()) as MatrixSnapshot;
    if (!response.ok && !json.live_rsi) {
      throw new Error(json.error || t.fetchError);
    }
    return json;
  }, [t.fetchError]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const json = await loadMatrix();
        if (cancelled) return;
        setData(json);
        setError(json.error);
        setUpdatedAt(new Date().toISOString());
        const fromHold =
          prevSignal.current === "HOLD" || Boolean(json.alertPing);
        if (fromHold && json.signal === "SELL") {
          try {
            playSellPing();
          } catch {
            // autoplay may need a click; Enable sound covers that
          }
        }
        prevSignal.current = json.signal;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadMatrix]);

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
        // matrix VWAP remains the source of truth for trades
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
      const json = await loadMatrix();
      setData(json);
      setError(json.error);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [loadMatrix]);

  const headerPrice = livePrice?.usd ?? data?.live_price ?? data?.live_vwap ?? 0;
  const locked = Boolean(data?.breakoutLock);
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
          label={t.liveRsi}
          value={data ? data.live_rsi.toFixed(2) : "—"}
          hint={`prev ${data ? data.rsi_prev.toFixed(2) : "—"}`}
          tone={locked || (data?.live_rsi ?? 0) > 75 ? "sell" : undefined}
        />
        <StatCard
          label={t.liveAtr}
          value={data ? formatUsd(data.live_atr) : "—"}
          hint="Lock if ATR > $150 and RSI > 75"
          tone={(data?.live_atr ?? 0) > 150 ? "sell" : undefined}
        />
        <StatCard
          label={t.liveVwap}
          value={data ? formatUsd(data.live_vwap) : "—"}
          hint={data?.source ?? t.venues}
        />
        <StatCard
          label={t.matrixSignal}
          value={locked ? t.holding : signal}
          hint={
            locked
              ? t.breakoutHold
              : signal === "SELL"
                ? t.sellHint
                : signal === "BUY"
                  ? t.buyHint
                  : t.waitingExhaustion
          }
          tone={
            locked || signal === "HOLD"
              ? "sell"
              : signal === "BUY"
                ? "buy"
                : signal === "SELL"
                  ? "sell"
                  : undefined
          }
        />
      </section>

      {locked && (
        <Card className="border-red-500/50 bg-red-500/15 shadow-none">
          <CardContent className="flex items-start gap-3 pt-1">
            <ShieldAlert className="mt-0.5 size-6 text-red-300" />
            <div>
              <p className="text-lg font-bold tracking-wide text-red-100">
                {t.breakoutHold}
              </p>
              <p className="mt-1 text-sm text-red-100/80">{t.breakoutHint}</p>
              <p className="mt-1 font-mono text-xs text-red-200">
                live_rsi={data?.live_rsi.toFixed(2)} · live_atr=
                {formatUsd(data?.live_atr ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/30 text-emerald-300"
        >
          <Radio className="size-3" />
          {data?.source || t.connectingLiveFeed}
        </Badge>
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
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="space-y-4">
            <ArmedTicket data={data} t={t} locked={locked} />
            <SizerCard
              title={`${t.positionSizer} · SELL`}
              plan={data.sellPlan}
              t={t}
              active={data.signal === "SELL" && !locked}
            />
            <SizerCard
              title={`${t.positionSizer} · BUY`}
              plan={data.buyPlan}
              t={t}
              active={data.signal === "BUY" && !locked}
            />
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
                  Near-touch bids {data.bidsNear.toFixed(2)} BTC · asks{" "}
                  {data.asksNear.toFixed(2)} BTC
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{t.howToRead}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{t.waitingExhaustion}</p>
                <p>{t.breakoutHint}</p>
                <p>{t.profitNote}</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

function ArmedTicket({
  data,
  t,
  locked,
}: {
  data: MatrixSnapshot;
  t: Dictionary;
  locked: boolean;
}) {
  const plan = data.armedPlan;
  if (locked || !plan) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/10 shadow-none">
        <CardContent className="space-y-2 pt-1">
          <p className="text-sm font-semibold">
            {locked ? t.breakoutHold : t.waiting}
          </p>
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

function SizerCard({
  title,
  plan,
  t,
  active,
}: {
  title: string;
  plan: RiskPlan | null;
  t: Dictionary;
  active: boolean;
}) {
  if (!plan) return null;
  return (
    <Card
      className={`shadow-none ${
        active ? "border-amber-400/50" : "border-border/60"
      }`}
    >
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PlanGrid plan={plan} t={t} />
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
          {t.stopAtr}
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
