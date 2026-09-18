"use client";

import type { M1Bar, WhaleWall } from "@/lib/m1";
import { formatUsd } from "@/lib/format";

type Props = {
  bars: M1Bar[];
  walls: WhaleWall[];
  live: number;
  vwap: number;
  entry?: number | null;
  stop?: number | null;
  takeProfit?: number | null;
};

export function M1Chart({
  bars,
  walls,
  live,
  vwap,
  entry,
  stop,
  takeProfit,
}: Props) {
  const slice = bars.slice(-60);
  if (slice.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border/70 text-sm text-muted-foreground">
        Waiting for M1 candles…
      </div>
    );
  }

  const padL = 58;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const width = 860;
  const height = 340;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const lows = slice.map((b) => b.low);
  const highs = slice.map((b) => b.high);
  const nearbyWalls = walls.filter(
    (wall) => live > 0 && Math.abs(wall.price - live) / live <= 0.08
  );
  const extras = [
    live,
    vwap,
    entry,
    stop,
    takeProfit,
    ...nearbyWalls.flatMap((wall) => [wall.priceLow, wall.priceHigh]),
  ].filter((n): n is number => typeof n === "number" && n > 0);
  const min = Math.min(...lows, ...extras);
  const max = Math.max(...highs, ...extras);
  const span = Math.max(max - min, 8);
  const yMin = min - span * 0.06;
  const yMax = max + span * 0.06;
  const y = (price: number) =>
    padT + ((yMax - price) / (yMax - yMin)) * plotH;
  const candleW = Math.max(plotW / slice.length - 2, 3);
  const visibleWalls = walls.filter(
    (wall) => wall.priceHigh >= yMin && wall.priceLow <= yMax
  );

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const price = yMin + ((yMax - yMin) * i) / ticks;
    return { price, y: y(price) };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[320px]"
        role="img"
        aria-label="1-minute BTC chart with whale order-book walls"
      >
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          className="fill-background/40"
        />
        {yTicks.map((tick) => (
          <g key={tick.price}>
            <line
              x1={padL}
              x2={width - padR}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border/70"
              strokeDasharray="3 5"
            />
            <text
              x={padL - 6}
              y={tick.y + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="10"
            >
              {formatUsd(tick.price)}
            </text>
          </g>
        ))}

        {visibleWalls.slice(0, 10).map((wall) => {
          const top = y(wall.priceHigh);
          const bot = y(wall.priceLow);
          const h = Math.max(bot - top, 6);
          const ask = wall.side === "ask";
          return (
            <g key={`${wall.side}-${wall.price}`}>
              <rect
                x={padL}
                y={top}
                width={plotW}
                height={h}
                rx={3}
                fill={ask ? "rgba(248,113,113,0.16)" : "rgba(52,211,153,0.16)"}
                stroke={ask ? "rgba(248,113,113,0.85)" : "rgba(52,211,153,0.85)"}
                strokeWidth={wall.whale ? 2 : 1}
                strokeDasharray={wall.whale ? undefined : "5 4"}
              />
              <text
                x={padL + 8}
                y={Math.max(top + 12, padT + 12)}
                className={ask ? "fill-red-200" : "fill-emerald-200"}
                fontSize="10"
              >
                {wall.whale ? "WHALE " : ""}
                {wall.side.toUpperCase()} {formatUsd(wall.price)} ·{" "}
                {wall.btc.toFixed(0)} BTC
              </text>
            </g>
          );
        })}

        {slice.map((bar, i) => {
          const x =
            padL + (i + 0.5) * (plotW / slice.length) - candleW / 2;
          const up = bar.close >= bar.open;
          const color = up ? "#34d399" : "#f87171";
          const bodyTop = y(Math.max(bar.open, bar.close));
          const bodyBot = y(Math.min(bar.open, bar.close));
          return (
            <g key={bar.time}>
              <line
                x1={x + candleW / 2}
                x2={x + candleW / 2}
                y1={y(bar.high)}
                y2={y(bar.low)}
                stroke={color}
                strokeWidth={1.2}
              />
              <rect
                x={x}
                y={bodyTop}
                width={candleW}
                height={Math.max(bodyBot - bodyTop, 1.5)}
                fill={color}
                rx={1}
              />
            </g>
          );
        })}

        <line
          x1={padL}
          x2={width - padR}
          y1={y(vwap)}
          y2={y(vwap)}
          stroke="#fbbf24"
          strokeWidth={1.4}
          strokeDasharray="6 4"
        />
        <line
          x1={padL}
          x2={width - padR}
          y1={y(live)}
          y2={y(live)}
          stroke="#f8fafc"
          strokeWidth={1}
        />
        {entry ? (
          <line
            x1={padL}
            x2={width - padR}
            y1={y(entry)}
            y2={y(entry)}
            stroke="#38bdf8"
            strokeWidth={1.2}
          />
        ) : null}
        {stop ? (
          <line
            x1={padL}
            x2={width - padR}
            y1={y(stop)}
            y2={y(stop)}
            stroke="#fb7185"
            strokeWidth={1.2}
            strokeDasharray="2 3"
          />
        ) : null}
        {takeProfit ? (
          <line
            x1={padL}
            x2={width - padR}
            y1={y(takeProfit)}
            y2={y(takeProfit)}
            stroke="#4ade80"
            strokeWidth={1.2}
            strokeDasharray="2 3"
          />
        ) : null}
      </svg>
    </div>
  );
}
