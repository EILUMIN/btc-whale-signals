"use client";

import { LanguageToggle } from "@/components/language-toggle";
import { M1Chart } from "@/components/m1-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/language-provider";
import { interpolate, type Dictionary } from "@/lib/i18n";
import {
  PRICE_STALE_SEC,
  SCAN_STALE_SEC,
  ageSeconds,
  formatBtc,
  formatIsoUtc,
  formatUsd,
  isStale,
} from "@/lib/format";
import type { M1Snapshot, RiskPlan, WhaleWall } from "@/lib/m1";
import { lotsGuide, puPrimeQuote } from "@/lib/m1";
import { matrixApiUrl, priceApiUrl } from "@/lib/urls";
import type { LivePrice, VenueTick } from "@/lib/types";
import { ExternalLink, Radio, RefreshCw, Volume2 } from "lucide-react";
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "failed">(
    "scanning"
  );
  const lastPingCandle = useRef<number | null>(null);
  const snapshotInFlight = useRef(false);

  const loadSnapshot = useCallback(async () => {
    const response = await fetch(matrixApiUrl(), { cache: "no-store" });
    const json = (await response.json()) as M1Snapshot;
    if (!response.ok && !json.ok) {
      throw new Error(json.error || t.fetchError);
    }
    return json;
  }, [t.fetchError]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (snapshotInFlight.current) return;
      snapshotInFlight.current = true;
      setScanPhase("scanning");
      try {
        const json = await loadSnapshot();
        if (cancelled) return;
        setData(json);
        setError(json.error);
        setUpdatedAt(new Date().toISOString());
        setScanPhase(json.ok ? "idle" : "failed");
        const pingThisCandle =
          Boolean(json.alertPing) &&
          (json.direction === "LONG" || json.direction === "SHORT") &&
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
        setScanPhase("failed");
      } finally {
        snapshotInFlight.current = false;
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
  const priceStamp = livePrice?.timestamp ?? data?.scannedAt ?? null;
  const priceAge = priceStamp ? ageSeconds(priceStamp, nowMs) : null;
  const priceStale = isStale(priceStamp, PRICE_STALE_SEC, nowMs);
  const scanStamp = data?.scannedAt ?? null;
  const scanAge = scanStamp ? ageSeconds(scanStamp, nowMs) : null;
  const scanStale = isStale(scanStamp, SCAN_STALE_SEC, nowMs);
  const venues: VenueTick[] =
    livePrice?.venues?.length
      ? livePrice.venues
      : (data?.venues ?? []).map((venue) => ({
          name: venue.name,
          symbol: venue.symbol,
          last: venue.last,
          ok: venue.ok,
          timestamp: data?.scannedAt ?? new Date(nowMs).toISOString(),
        }));
  const signal = data?.direction ?? "WAIT";
  const whaleSignal = data?.whaleSignal ?? data?.signal ?? "WAIT";
  const scanLabel =
    scanPhase === "scanning" && !data
      ? t.scanScanning
      : scanPhase === "failed" && !data
        ? t.scanFailed
        : scanStale
          ? t.scanStale
          : data?.scanStatus === "failed"
            ? t.scanFailed
            : data?.scanStatus === "scanning"
              ? t.scanScanning
              : t.scanOk;

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
              {priceStale ? t.stalePrice : t.livePrice}
            </p>
            {headerPrice ? (
              <>
                <p className="font-mono text-3xl font-semibold">
                  {formatUsd(headerPrice)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {livePrice?.source ?? data?.source} ·{" "}
                  {priceStale ? t.staleTick : t.liveTick}{" "}
                  {priceStamp ? formatIsoUtc(priceStamp) : "—"}
                  {priceAge !== null
                    ? ` · ${interpolate(t.dataAge, { n: priceAge })}`
                    : ""}
                </p>
                <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {t.puPrimeLive}
                </p>
                <p className="font-mono text-lg font-semibold">
                  {formatUsd(puPrimeQuote(headerPrice))}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t.puPrimeGapHint}
                </p>
              </>
            ) : (
              <Skeleton className="mt-2 h-9 w-40" />
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
          label={t.onchainOut}
          value={data ? formatBtc(data.flow.outflows) : "—"}
          hint={t.buyHint}
          tone={(data?.flow.outflows ?? 0) >= 500 ? "buy" : undefined}
        />
        <StatCard
          label={t.setupState}
          value={data?.dataStale ? t.dataStale : signal}
          hint={
            signal === "SHORT"
              ? t.shortHint
              : signal === "LONG"
                ? t.longHint
                : data?.waitReason || t.waitHint
          }
          tone={
            data?.dataStale
              ? "stale"
              : signal === "LONG"
                ? "buy"
                : signal === "SHORT"
                  ? "sell"
                  : "wait"
          }
        />
        <StatCard
          label={t.whaleTape}
          value={whaleSignal}
          hint={
            whaleSignal === "SELL"
              ? t.sellHint
              : whaleSignal === "BUY"
                ? t.buyHint
                : t.waitHint
          }
          tone={
            whaleSignal === "BUY"
              ? "buy"
              : whaleSignal === "SELL"
                ? "sell"
                : "wait"
          }
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/30 text-emerald-300"
        >
          <Radio className="size-3" />
          {venues.some((row) => row.ok)
            ? venues
                .filter((row) => row.ok)
                .map((row) => row.name)
                .join(" + ")
            : data?.source || t.connectingLiveFeed}
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
        {data?.discordStatus === "sent" && (
          <span className="text-emerald-300">{t.discordSent}</span>
        )}
        {data?.discordStatus === "skipped" && (
          <span className="text-amber-300">{t.discordSkipped}</span>
        )}
        {data?.discordStatus === "failed" && (
          <span className="text-red-300">
            {interpolate(t.discordFailed, { detail: data.discordDetail ?? "" })}
          </span>
        )}
        {(data?.discordStatus === "idle" || !data?.discordStatus) && (
          <span>{t.discordIdle}</span>
        )}
        {data?.spoofChecked && data.spoofCleared && (
          <span className="text-emerald-300">{t.spoofOk}</span>
        )}
        {data?.spoofChecked && !data.spoofCleared && (
          <span className="text-amber-300">{t.spoofFail}</span>
        )}
        <span>
          {t.lastScan}: {scanLabel}
          {scanStamp
            ? ` · ${formatIsoUtc(scanStamp)}${
                scanAge !== null
                  ? ` · ${interpolate(t.dataAge, { n: scanAge })}`
                  : ""
              }`
            : scanPhase === "scanning"
              ? ` · ${t.scanScanning}`
              : ` · ${t.scanFailed}`}
        </span>
        {updatedAt && (
          <span>
            {t.uiRefresh}: {formatIsoUtc(updatedAt)}
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

      {venues.length > 0 && !data && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">{t.venues}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {venues.map((venue) => (
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
                  entry={data.tradePlan?.entry ?? data.armedPlan?.entry}
                  stop={data.tradePlan?.stop ?? data.armedPlan?.stop}
                  takeProfit={data.tradePlan?.tp1 ?? data.armedPlan?.takeProfit}
                  takeProfit2={data.tradePlan?.tp2}
                />
                <p className="text-xs text-muted-foreground">{t.chartHint}</p>
              </CardContent>
            </Card>
            <TradePlanCard data={data} t={t} />
            <OverallBiasCard data={data} t={t} nowMs={nowMs} />
            <PossibleEntryCard data={data} t={t} nowMs={nowMs} />
            <ArmedTicket data={data} t={t} />
            <WallList
              walls={data.walls}
              live={livePrice?.usd ?? data.live_price}
              t={t}
            />
          </section>
          <aside className="space-y-4">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{t.venues}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(venues.length ? venues : data.venues).map((venue) => (
                  <div
                    key={venue.name}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
                  >
                    <span className="font-medium">{venue.name}</span>
                    {"ok" in venue && venue.ok === false ? (
                      <span className="text-xs text-red-300">offline</span>
                    ) : (
                      <span className="font-mono text-xs">
                        {formatUsd(venue.last)}
                      </span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            <FuturesPanel data={data} t={t} nowMs={nowMs} />
            <PaperPanel data={data} t={t} />
            <FlowTape data={data} t={t} />
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="text-sm">{t.howToRead}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{t.precisionExplain}</p>
                <p>{t.inflowExplain}</p>
                <p>{t.outflowExplain}</p>
                <p>{t.unlabeledExplain}</p>
                <p>{t.spoofExplain}</p>
                <p>{t.puPrimeExplain}</p>
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
  const pu = data.puPrimePlan;
  const armed =
    (data.direction === "LONG" || data.direction === "SHORT") && data.tradePlan;
  if (!plan || !armed) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/10 shadow-none">
        <CardContent className="space-y-2 pt-1">
          <p className="text-sm font-semibold">{t.waiting}</p>
          <p className="text-sm text-muted-foreground">
            {data.waitReason || data.recommendation}
          </p>
          <p className="text-xs text-muted-foreground">{t.puPrimeWait}</p>
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
      <CardContent className="space-y-4 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.armed} · {plan.side}
          </p>
          <p className="text-sm font-semibold">
            {interpolate(sell ? t.sellNow : t.buyNow, {
              entry: formatUsd(pu?.entry ?? plan.entry),
            })}
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <LevelBook
            title={t.exchangeLevels}
            hint={t.liveTick}
            plan={plan}
            t={t}
            lots={false}
          />
          {pu ? (
            <LevelBook
              title={t.puPrimeLevels}
              hint={t.puPrimeGapHint}
              plan={pu}
              t={t}
              lots
            />
          ) : null}
        </div>
        <p className="text-sm">
          {interpolate(sell ? t.sellPlan : t.buyPlan, vars)}
        </p>
        <p className="text-[11px] text-muted-foreground">{t.profitNote}</p>
      </CardContent>
    </Card>
  );
}

function LevelBook({
  title,
  hint,
  plan,
  t,
  lots,
}: {
  title: string;
  hint: string;
  plan: RiskPlan;
  t: Dictionary;
  lots: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">{hint}</p>
      <PlanGrid plan={plan} t={t} lots={lots} />
    </div>
  );
}

function wallStatusClass(status: WhaleWall["status"]) {
  if (status === "HIT") return "border-amber-400/60 bg-amber-400/15 text-amber-200";
  if (status === "REJECTED") return "border-emerald-500/50 bg-emerald-500/15 text-emerald-200";
  if (status === "BROKEN") return "border-red-500/50 bg-red-500/15 text-red-200";
  if (status === "REMOVED") return "border-zinc-500/50 bg-zinc-500/15 text-zinc-300";
  if (status === "DISTANT") return "border-zinc-600/50 bg-zinc-600/10 text-zinc-400";
  return "border-sky-500/40 bg-sky-500/10 text-sky-200";
}

function WallRow({
  wall,
  t,
  live,
}: {
  wall: WhaleWall;
  t: Dictionary;
  live: number;
}) {
  const status = wall.status ?? "DISTANT";
  const hit = wall.hit;
  const distancePct =
    live > 0 && wall.price > 0
      ? (Math.abs(wall.price - live) / live) * 100
      : null;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
        status === "DISTANT"
          ? "border-border/50 bg-background/30"
          : wall.side === "ask"
            ? "border-red-500/30 bg-red-500/5"
            : "border-emerald-500/30 bg-emerald-500/5"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {wall.whale ? t.whaleWall : t.notableWall} ·{" "}
            {wall.side === "ask" ? t.asks : t.bids}
          </p>
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold uppercase tracking-wider ${wallStatusClass(status)}`}
          >
            {status}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {formatUsd(wall.priceLow)} – {formatUsd(wall.priceHigh)} ·{" "}
          {wall.venues.join(", ")}
        </p>
        {hit ? (
          <p className="text-[11px] text-muted-foreground">
            {interpolate(t.wallHitLine, {
              time: formatIsoUtc(hit.timestamp),
              price: formatUsd(hit.price),
              exchange: hit.exchange,
              side: hit.side,
              btc: formatBtc(hit.btc),
            })}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p className="font-mono font-semibold">{formatUsd(wall.price)}</p>
        <p className="text-xs text-muted-foreground">
          {formatBtc(wall.btc)}
          {status === "DISTANT" && distancePct !== null
            ? ` · ${distancePct.toFixed(2)}%`
            : ""}
        </p>
      </div>
    </div>
  );
}

function WallList({
  walls,
  live,
  t,
}: {
  walls: WhaleWall[];
  live: number;
  t: Dictionary;
}) {
  const active = walls.filter((wall) => wall.status !== "DISTANT");
  const distant = walls.filter((wall) => wall.status === "DISTANT");
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{t.wallsTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.wallsEmpty}</p>
        )}
        {active.slice(0, 8).map((wall) => (
          <WallRow
            key={`${wall.side}-${wall.price}-${wall.status ?? "active"}`}
            wall={wall}
            t={t}
            live={live}
          />
        ))}
        {distant.length > 0 ? (
          <div className="space-y-2 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.distantWallsTitle}
            </p>
            <p className="text-[11px] text-muted-foreground">{t.distantWallsHint}</p>
            {distant.slice(0, 6).map((wall) => (
              <WallRow
                key={`${wall.side}-${wall.price}-distant`}
                wall={wall}
                t={t}
                live={live}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function kindLabel(kind: string, t: Dictionary) {
  if (kind === "inflow") return t.inflow;
  if (kind === "outflow") return t.outflow;
  if (kind === "internal") return t.internal;
  return t.unlabeled;
}

function FlowTape({ data, t }: { data: M1Snapshot; t: Dictionary }) {
  const flow = data.flow;
  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm">{t.flowTitle}</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {interpolate(t.esploraVia, { source: flow.esploraSource })} ·{" "}
          {interpolate(t.watchedWallets, { count: flow.watchedWallets })} ·{" "}
          {t.flowWindow}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat
            label={t.unlabeledFlow}
            value={formatBtc(flow.unlabeled)}
            muted
          />
          <MiniStat
            label={t.internal}
            value={formatBtc(flow.internal)}
            muted
          />
          <MiniStat
            label={t.pendingFlow}
            value={formatBtc(flow.pendingBtc)}
          />
          <MiniStat
            label={t.confirmedFlow}
            value={formatBtc(flow.confirmedBtc)}
          />
        </div>
        {flow.prints.length === 0 && (
          <p className="text-muted-foreground">{t.flowEmpty}</p>
        )}
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {flow.prints.slice(0, 24).map((print) => (
            <a
              key={print.txid}
              href={print.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-border/60 px-2 py-2 hover:border-amber-500/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    print.kind === "inflow"
                      ? "text-red-300"
                      : print.kind === "outflow"
                        ? "text-emerald-300"
                        : print.kind === "internal"
                          ? "text-amber-300"
                          : "text-muted-foreground"
                  }`}
                >
                  {kindLabel(print.kind, t)}
                </span>
                <span className="font-mono text-xs font-semibold">
                  {formatBtc(print.btc)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t.tapeFrom} {print.fromLabel} → {t.tapeTo} {print.toLabel}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>
                  {print.pending
                    ? t.pendingPrint
                    : interpolate(t.confirmedPrint, { n: print.confirmations })}
                </span>
                <span>
                  {t.eta}: {print.etaLabel}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ExternalLink className="size-3" />
                  {t.openExplorer}
                </span>
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-mono text-sm font-semibold ${
          muted ? "text-muted-foreground" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PlanGrid({
  plan,
  t,
  lots = false,
}: {
  plan: RiskPlan;
  t: Dictionary;
  lots?: boolean;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
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
          {lots ? t.sizeLots : t.sizeBtc}
        </dt>
        <dd className="font-mono text-xl font-semibold">
          {lots ? lotsGuide(plan.sizeLots) : formatBtc(plan.sizeBtc)}
        </dd>
        <dd className="text-[11px] text-muted-foreground">
          {t.riskUsd} {formatUsd(plan.riskUsd)} · {t.notional}{" "}
          {formatUsd(plan.notionalUsd)}
        </dd>
      </div>
    </dl>
  );
}

function TradePlanCard({ data, t }: { data: M1Snapshot; t: Dictionary }) {
  const plan = data.tradePlan;
  const direction = data.direction ?? "WAIT";
  const wait = direction === "WAIT" || !plan;
  return (
    <Card
      className={`shadow-none ${
        wait
          ? "border-amber-500/40 bg-amber-500/10"
          : direction === "SHORT"
            ? "border-red-500/40 bg-red-500/10"
            : "border-emerald-500/40 bg-emerald-500/10"
      }`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">{t.tradePlanTitle}</CardTitle>
        {data.paperTrading ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-200">
            {t.paperBadge}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        <p
          className={`font-mono text-3xl font-semibold ${
            wait
              ? "text-amber-300"
              : direction === "LONG"
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          {data.dataStale ? t.dataStale : direction}
        </p>
        {wait ? (
          <p className="text-muted-foreground">
            {data.waitReason || data.recommendation}
          </p>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.entryZone}
                </dt>
                <dd className="font-mono text-lg">
                  {formatUsd(plan.entryLow)} – {formatUsd(plan.entryHigh)}
                </dd>
                <dd className="font-mono text-sm text-muted-foreground">
                  {formatUsd(plan.entry)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.stopLoss}
                </dt>
                <dd className="font-mono text-lg text-red-300">
                  {formatUsd(plan.stop)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.takeProfit1}
                </dt>
                <dd className="font-mono text-lg text-emerald-300">
                  {formatUsd(plan.tp1)} · 1:{plan.rrTp1.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.takeProfit2}
                </dt>
                <dd className="font-mono text-lg text-emerald-300">
                  {formatUsd(plan.tp2)} · 1:{plan.rrTp2.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.sizeBtc}
                </dt>
                <dd className="font-mono text-lg">{formatBtc(plan.sizeBtc)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.maxRisk}
                </dt>
                <dd className="font-mono text-lg">{formatUsd(plan.riskUsd)}</dd>
                <dd className="text-[11px] text-muted-foreground">
                  {t.estimatedLoss} {formatUsd(plan.estimatedLossUsd)}
                </dd>
              </div>
            </dl>
            <p>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.strength}
              </span>{" "}
              {plan.strength}
            </p>
            <p className="text-xs text-muted-foreground">{plan.leverageHint}</p>
            <p>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.invalidation}
              </span>{" "}
              {plan.invalidation}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.signalTime}: {formatIsoUtc(plan.timestamp)} · {t.signalExpiry}:{" "}
              {formatIsoUtc(plan.expiry)}
            </p>
            <p>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.reasonLabel}
              </span>{" "}
              {plan.reason}
            </p>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">{t.paperHint}</p>
      </CardContent>
    </Card>
  );
}

function OverallBiasCard({
  data,
  t,
  nowMs,
}: {
  data: M1Snapshot;
  t: Dictionary;
  nowMs: number;
}) {
  const bias = data.overallBias;
  const status = bias?.status ?? "WAIT";
  const wait = status === "WAIT";
  const age = bias?.timestamp ? ageSeconds(bias.timestamp, nowMs) : null;
  return (
    <Card
      className={`shadow-none ${
        wait
          ? "border-border/70"
          : status === "POSSIBLE SHORT"
            ? "border-red-500/40 bg-red-500/10"
            : "border-emerald-500/40 bg-emerald-500/10"
      }`}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm">{t.overallBiasTitle}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{t.overallBiasHint}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        <p
          className={`font-mono text-2xl font-semibold ${
            wait
              ? "text-amber-300"
              : status === "POSSIBLE LONG"
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          {status}
        </p>
        <p className="text-muted-foreground">{bias?.reason ?? t.waitHint}</p>
        <p>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.tfAgreement}
          </span>{" "}
          {bias?.agreement.summary ?? "—"}
        </p>
        <p>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.confidenceLabel}
          </span>{" "}
          {bias ? `${bias.confidence}` : "—"}
        </p>
        <p>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.trendTimeframe}
          </span>{" "}
          {bias?.timeframe ?? "H1 · M15 · M5 · M1"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t.lastUpdated}: {bias?.timestamp ? formatIsoUtc(bias.timestamp) : "—"}
          {age !== null ? ` · ${t.dataAge.replace("{n}", String(age))}` : ""}
          {bias?.source ? ` · ${bias.source}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function PossibleEntryCard({
  data,
  t,
  nowMs,
}: {
  data: M1Snapshot;
  t: Dictionary;
  nowMs: number;
}) {
  const entry = data.possibleEntry;
  const status = entry?.status ?? "WAIT";
  const wait = status === "WAIT";
  const whale = entry?.whaleConfirmation ?? "UNAVAILABLE";
  const age = entry?.timestamp ? ageSeconds(entry.timestamp, nowMs) : null;
  return (
    <Card
      className={`shadow-none ${
        wait
          ? "border-border/70"
          : status === "POSSIBLE SHORT"
            ? "border-red-500/40 bg-red-500/10"
            : "border-emerald-500/40 bg-emerald-500/10"
      }`}
    >
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm">{t.possibleEntryTitle}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{t.possibleEntryHint}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        <p
          className={`font-mono text-2xl font-semibold ${
            wait
              ? "text-amber-300"
              : status === "POSSIBLE LONG"
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          {status}
        </p>
        <p className="text-muted-foreground">{entry?.reason ?? t.waitHint}</p>
        {!wait && entry ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.entryZone}
              </dt>
              <dd className="font-mono text-lg">
                {formatUsd(entry.entryLow ?? 0)} – {formatUsd(entry.entryHigh ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.stopLoss}
              </dt>
              <dd className="font-mono text-lg text-red-300">
                {entry.stop !== null ? formatUsd(entry.stop) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.takeProfit1}
              </dt>
              <dd className="font-mono text-lg text-emerald-300">
                {entry.tp1 !== null ? formatUsd(entry.tp1) : "—"}
                {entry.rr !== null ? ` · 1:${entry.rr.toFixed(2)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.takeProfit2}
              </dt>
              <dd className="font-mono text-lg text-emerald-300">
                {entry.tp2 !== null ? formatUsd(entry.tp2) : "—"}
              </dd>
            </div>
          </dl>
        ) : null}
        <p>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.confidenceLabel}
          </span>{" "}
          {entry ? `${entry.confidence}` : "—"}
        </p>
        <p>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.trendTimeframe}
          </span>{" "}
          {entry?.timeframe ?? "M15 · M5 · M1"}
        </p>
        <p>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.whaleConfirmLabel}:
          </span>{" "}
          {whale}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t.lastUpdated}: {entry?.timestamp ? formatIsoUtc(entry.timestamp) : "—"}
          {age !== null ? ` · ${t.dataAge.replace("{n}", String(age))}` : ""}
          {entry?.source ? ` · ${entry.source}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function FuturesPanel({
  data,
  t,
  nowMs,
}: {
  data: M1Snapshot;
  t: Dictionary;
  nowMs: number;
}) {
  const fut = data.futures;
  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm">{t.futuresTitle}</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {t.futuresHint}
          {fut?.source ? ` · ${fut.source}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!fut || fut.metrics.length === 0 ? (
          <p className="text-muted-foreground">{t.dataStale}</p>
        ) : (
          fut.metrics.map((row) => {
            const age = row.timestamp ? ageSeconds(row.timestamp, nowMs) : null;
            const tone =
              row.tone === "long"
                ? "text-emerald-300"
                : row.tone === "short"
                  ? "text-red-300"
                  : row.tone === "stale"
                    ? "text-zinc-400"
                    : "text-amber-300";
            return (
              <div
                key={row.label}
                className="rounded-md border border-border/60 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {row.label}
                  </span>
                  <span className={`font-mono text-xs font-semibold ${tone}`}>
                    {row.display}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {row.source}
                  {row.optional ? ` · ${t.optionalConfirm}` : ""}
                  {row.timestamp ? ` · ${formatIsoUtc(row.timestamp)}` : ""}
                  {age !== null ? ` · ${t.dataAge.replace("{n}", String(age))}` : ""}
                  {row.detail ? ` · ${row.detail}` : ""}
                  {row.status === "unavailable"
                    ? row.reason && row.reason !== row.detail
                      ? ` · ${row.reason}`
                      : ""
                    : row.status === "fresh"
                      ? ` · ${t.dataFresh}`
                      : row.status === "stale" || row.stale
                        ? ` · ${t.dataStale}`
                        : row.missing
                          ? ` · ${t.dataStale}`
                          : ""}
                </p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function PaperPanel({ data, t }: { data: M1Snapshot; t: Dictionary }) {
  const stats = data.paperStats;
  const pct =
    stats?.winRate === null || stats?.winRate === undefined
      ? "—"
      : `${(stats.winRate * 100).toFixed(0)}%`;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-sm">{t.paperStats}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 text-sm">
        <MiniStat label={t.winRate} value={pct} />
        <MiniStat
          label={t.avgR}
          value={stats?.avgR === null || stats?.avgR === undefined ? "—" : stats.avgR.toFixed(2)}
        />
        <MiniStat
          label={t.maxDd}
          value={stats ? stats.maxDrawdownR.toFixed(2) : "—"}
        />
        <MiniStat
          label={t.loseStreak}
          value={stats ? String(stats.losingStreak) : "—"}
        />
        <MiniStat
          label={t.falseSignals}
          value={stats ? String(stats.falseSignals) : "—"}
        />
        <MiniStat
          label={t.blockedSignals}
          value={stats ? String(stats.blocked) : "—"}
        />
      </CardContent>
    </Card>
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
  tone?: "buy" | "sell" | "wait" | "stale";
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
                : tone === "wait"
                  ? "text-amber-300"
                  : tone === "stale"
                    ? "text-zinc-400"
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
