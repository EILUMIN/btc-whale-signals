#!/usr/bin/env python3
"""
master_bot.py
M1 Whale Signal Desk — on-chain flows + order-book walls.

Public data only. No private API keys.
Canada-safe: Binance.US fallback when Binance.com is geo-blocked.

    pip install ccxt
    python3 master_bot.py
    python3 master_bot.py --once

Not financial advice. Paper risk math on a $1,000 wallet (1% stop risk).
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import smtplib
import sys
import time
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

try:
    import ccxt  # type: ignore
except ImportError:  # pragma: no cover
    print("Missing dependency: pip install ccxt", file=sys.stderr)
    sys.exit(1)

SATS = 100_000_000
WHALE_BTC = 500.0
NOTABLE_WALL_BTC = 80.0
WALL_BUCKET = 25.0
TOUCH_PCT = 0.0025
SPOOF_SEC = 5.0
SPOOF_KEEP = 0.8
WALLET_USD = 1_000.0
RISK_USD = 10.0
RR_MULT = 3.0
BOOK_LIMIT = 500
M1_LIMIT = 90
FLOW_WINDOW_SEC = 60 * 60
LOOP_SEC = 15
HTTP_TIMEOUT = 12
GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 587
DEFAULT_EMAIL_RECEIVER = "elmer.whaledesk@gmail.com"
M1_ALERT_SUBJECT = "[HIGH-CONFIDENCE CONFLUENCE] M1 Whale Signal Alert"
USER_AGENT = (
    "Mozilla/5.0 (compatible; MasterBot/2.0; +https://github.com/EILUMIN/btc-whale-signals)"
)
MEMPOOL_API = os.environ.get("MEMPOOL_API_BASE", "https://mempool.space/api").rstrip("/")

EXCHANGE_WALLETS = {
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": "Binance",
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": "Binance",
    "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": "Coinbase",
    "3Nxwenay9Z8Lc9JBiywTo1sZkyn2nQaaKR": "Coinbase",
    "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r": "Bitfinex",
    "1Kr6QSydW9bFQG1mXiPNNu6WpJGmUa9i1g": "Bitfinex",
}

ROUTES = [
    ("binance", "BTC/USDT", "binance"),
    ("coinbaseexchange", "BTC/USD", "coinbase"),
    ("kraken", "BTC/USD", "kraken"),
]
FALLBACKS = {
    "binance": ("binanceus", "BTC/USD"),
    "coinbaseexchange": ("coinbase", "BTC/USD"),
}


def load_dotenv(path: str | None = None) -> None:
    root = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(root):
        return
    with open(root, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


load_dotenv()


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def candle_key(ts: float | None = None) -> int:
    return int((ts if ts is not None else time.time()) // 60)


def round_px(value: float) -> float:
    return round(value + 1e-9, 2)


def http_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))


def make_exchange(exchange_id: str) -> Any:
    klass = getattr(ccxt, exchange_id)
    return klass({"enableRateLimit": True, "timeout": 12_000, "options": {"defaultType": "spot"}})


def parse_levels(side: Any) -> list[tuple[float, float]]:
    rows: list[tuple[float, float]] = []
    for item in side or []:
        try:
            price = float(item[0])
            amount = float(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        if price > 0 and amount > 0:
            rows.append((price, amount))
    return rows


def pull_book(exchange_id: str, symbol: str, label: str) -> dict[str, Any]:
    try:
        ex = make_exchange(exchange_id)
        ticker = ex.fetch_ticker(symbol)
        book = ex.fetch_order_book(symbol, BOOK_LIMIT)
        last = float(ticker.get("last") or ticker.get("close") or 0)
        return {
            "name": label,
            "symbol": symbol,
            "last": last,
            "ok": True,
            "error": None,
            "bids": parse_levels(book.get("bids")),
            "asks": parse_levels(book.get("asks")),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "name": label,
            "symbol": symbol,
            "last": 0.0,
            "ok": False,
            "error": str(exc)[:160],
            "bids": [],
            "asks": [],
        }


def pull_book_with_fallback(exchange_id: str, symbol: str, label: str) -> dict[str, Any]:
    primary = pull_book(exchange_id, symbol, label)
    if primary["ok"]:
        return primary
    fallback = FALLBACKS.get(exchange_id)
    if not fallback:
        return primary
    second = pull_book(fallback[0], fallback[1], label)
    return second


def pull_ohlcv(exchange_id: str, symbol: str) -> list[list[float]]:
    try:
        ex = make_exchange(exchange_id)
        return ex.fetch_ohlcv(symbol, "1m", limit=M1_LIMIT)
    except Exception:
        fallback = FALLBACKS.get(exchange_id)
        if not fallback:
            return []
        try:
            ex = make_exchange(fallback[0])
            return ex.fetch_ohlcv(fallback[1], "1m", limit=M1_LIMIT)
        except Exception:
            return []


def cluster_walls(levels: list[tuple[float, float, str]], side: str) -> list[dict[str, Any]]:
    buckets: dict[float, dict[str, Any]] = {}
    for price, btc, venue in levels:
        if price < WALL_BUCKET or btc <= 0:
            continue
        key = round(price / WALL_BUCKET) * WALL_BUCKET
        if key < WALL_BUCKET:
            continue
        cur = buckets.get(key)
        if cur is None:
            cur = {"btc": 0.0, "low": price, "high": price, "venues": set()}
            buckets[key] = cur
        cur["btc"] += btc
        cur["low"] = min(cur["low"], price)
        cur["high"] = max(cur["high"], price)
        cur["venues"].add(venue)
    walls = []
    for price, cur in buckets.items():
        if cur["btc"] < NOTABLE_WALL_BTC:
            continue
        walls.append(
            {
                "side": side,
                "price": round_px(price),
                "priceLow": round_px(cur["low"]),
                "priceHigh": round_px(cur["high"]),
                "btc": round_px(cur["btc"]),
                "venues": sorted(cur["venues"]),
                "whale": cur["btc"] >= WHALE_BTC,
            }
        )
    walls.sort(key=lambda w: w["btc"], reverse=True)
    return walls


def wall_still_real(before: dict[str, Any] | None, after_list: list[dict[str, Any]]) -> bool:
    if not before:
        return False
    for wall in after_list:
        if wall["side"] != before["side"]:
            continue
        if abs(wall["price"] - before["price"]) <= WALL_BUCKET * 1.5:
            return wall["btc"] >= before["btc"] * SPOOF_KEEP and wall["btc"] >= WHALE_BTC * SPOOF_KEEP
    return False


def touches_ask(bar: dict[str, float], live: float, wall: dict[str, Any]) -> bool:
    band = wall["price"] * TOUCH_PCT
    return bar["high"] + band >= wall["priceLow"] and live <= wall["priceHigh"] + band


def leans_bid(bar: dict[str, float], live: float, wall: dict[str, Any]) -> bool:
    band = wall["price"] * TOUCH_PCT
    return bar["low"] - band <= wall["priceHigh"] and live >= wall["priceLow"] - band


def build_plan(side: str, vwap: float, wall: dict[str, Any]) -> dict[str, Any] | None:
    if vwap <= 0:
        return None
    entry = round_px(vwap)
    buffer = round_px(max(wall["price"] * 0.0002, 5))
    stop = round_px(wall["priceHigh"] + buffer) if side == "SELL" else round_px(wall["priceLow"] - buffer)
    risk_per = round_px(abs(entry - stop))
    if risk_per < 1:
        return None
    if side == "SELL" and stop <= entry:
        return None
    if side == "BUY" and stop >= entry:
        return None
    size = round(RISK_USD / risk_per, 6)
    tp = round_px(entry - RR_MULT * risk_per) if side == "SELL" else round_px(entry + RR_MULT * risk_per)
    return {
        "side": side,
        "entry": entry,
        "stop": stop,
        "takeProfit": tp,
        "wallPrice": wall["price"],
        "riskUsd": RISK_USD,
        "sizeBtc": size,
        "notionalUsd": round_px(size * entry),
        "rr": RR_MULT,
    }


def binance_delta() -> dict[int, tuple[float, float]]:
    hosts = ("https://api.binance.com", "https://api.binance.us")
    for host in hosts:
        try:
            rows = http_json(f"{host}/api/v3/klines?symbol=BTCUSDT&interval=1m&limit={M1_LIMIT}")
            out: dict[int, tuple[float, float]] = {}
            for row in rows:
                ts = int(row[0])
                volume = float(row[5])
                buy = float(row[9]) if len(row) > 9 else volume / 2
                out[ts] = (buy, max(volume - buy, 0.0))
            return out
        except Exception:
            continue
    return {}


def merge_bars(ohlcv_sets: list[list[list[float]]], delta: dict[int, tuple[float, float]]) -> list[dict[str, float]]:
    series: dict[int, list[list[float]]] = defaultdict(list)
    for candles in ohlcv_sets:
        for row in candles:
            if len(row) < 6:
                continue
            series[int(row[0])].append(row)
    bars = []
    for ts in sorted(series):
        rows = series[ts]
        n = len(rows)
        open_px = sum(float(r[1]) for r in rows) / n
        high = sum(float(r[2]) for r in rows) / n
        low = sum(float(r[3]) for r in rows) / n
        close = sum(float(r[4]) for r in rows) / n
        volume = sum(float(r[5]) for r in rows)
        buy, sell = delta.get(ts, (0.0, 0.0))
        if ts not in delta:
            buy = volume * (0.6 if close >= open_px else 0.4)
            sell = volume - buy
        bars.append(
            {
                "time": ts,
                "open": round_px(open_px),
                "high": round_px(high),
                "low": round_px(low),
                "close": round_px(close),
                "volume": volume,
                "buyVolume": buy,
                "sellVolume": sell,
            }
        )
    return bars


def session_vwap(bars: list[dict[str, float]]) -> float:
    pv = 0.0
    vol = 0.0
    for bar in bars:
        typical = (bar["high"] + bar["low"] + bar["close"]) / 3
        pv += typical * bar["volume"]
        vol += bar["volume"]
    return pv / vol if vol > 0 else 0.0


def classify_tx(tx: dict[str, Any]) -> tuple[str, float, float]:
    vins = tx.get("vin") or []
    vouts = tx.get("vout") or []
    from_ex = 0.0
    from_wal = 0.0
    to_ex = 0.0
    to_wal = 0.0
    for vin in vins:
        prev = vin.get("prevout") or {}
        addr = prev.get("scriptpubkey_address")
        btc = float(prev.get("value") or 0) / SATS
        if addr in EXCHANGE_WALLETS:
            from_ex += btc
        else:
            from_wal += btc
    in_addrs = {
        (vin.get("prevout") or {}).get("scriptpubkey_address")
        for vin in vins
        if (vin.get("prevout") or {}).get("scriptpubkey_address")
    }
    for vout in vouts:
        addr = vout.get("scriptpubkey_address")
        btc = float(vout.get("value") or 0) / SATS
        if addr in in_addrs:
            continue
        if addr in EXCHANGE_WALLETS:
            to_ex += btc
        else:
            to_wal += btc
    from_is_ex = from_ex > from_wal
    to_is_ex = to_ex > to_wal
    if from_is_ex and to_is_ex:
        return "internal", 0.0, 0.0
    if not from_is_ex and to_is_ex:
        return "inflow", to_ex, 0.0
    if from_is_ex and not to_is_ex:
        return "outflow", 0.0, to_wal or from_ex
    return "unlabeled", 0.0, 0.0


def scan_onchain() -> dict[str, Any]:
    cutoff = time.time() - FLOW_WINDOW_SEC
    inflows = 0.0
    outflows = 0.0
    prints: list[dict[str, Any]] = []
    txs: dict[str, dict[str, Any]] = {}
    try:
        recent = http_json(f"{MEMPOOL_API}/mempool/recent")
        for preview in recent:
            value = float(preview.get("value") or 0) / SATS
            if value < 50:
                continue
            txid = preview.get("txid")
            if not txid:
                continue
            try:
                txs[txid] = http_json(f"{MEMPOOL_API}/tx/{txid}")
            except Exception:
                continue
    except Exception:
        pass
    try:
        blocks = http_json(f"{MEMPOOL_API}/v1/blocks")
        for block in blocks[:2]:
            try:
                rows = http_json(f"{MEMPOOL_API}/block/{block['id']}/txs")
                for tx in rows:
                    txs[tx["txid"]] = tx
            except Exception:
                continue
    except Exception:
        pass

    for tx in txs.values():
        status = tx.get("status") or {}
        when = float(status.get("block_time") or time.time())
        if when < cutoff:
            continue
        kind, inflow, outflow = classify_tx(tx)
        inflows += inflow
        outflows += outflow
        sized = inflow or outflow
        if sized >= 50:
            prints.append({"txid": tx.get("txid"), "kind": kind, "btc": round(sized, 2)})
    return {
        "inflows": round(inflows, 2),
        "outflows": round(outflows, 2),
        "prints": prints[:12],
    }


def decide(flow: dict[str, Any], live: float, bar: dict[str, float] | None, asks: list[dict[str, Any]], bids: list[dict[str, Any]], cvd: float) -> dict[str, Any]:
    if not bar:
        return {"signal": "WAIT", "wall": None, "why": "Waiting for the current M1 candle."}
    whale_asks = [w for w in asks if w["whale"]]
    whale_bids = [w for w in bids if w["whale"]]
    ask_hit = next((w for w in whale_asks if touches_ask(bar, live, w)), None)
    bid_hit = next((w for w in whale_bids if leans_bid(bar, live, w)), None)
    inflow = flow["inflows"] >= WHALE_BTC
    outflow = flow["outflows"] >= WHALE_BTC
    if inflow and ask_hit and cvd <= 0:
        return {
            "signal": "SELL",
            "wall": ask_hit,
            "why": "M1 SELL: inflow >500 BTC + ask wall + selling CVD.",
        }
    if outflow and bid_hit and cvd >= 0:
        return {
            "signal": "BUY",
            "wall": bid_hit,
            "why": "M1 BUY: outflow >500 BTC + bid wall + buying CVD.",
        }
    missing = []
    if not inflow and not outflow:
        missing.append("no >500 BTC labeled inflow/outflow this hour")
    if not ask_hit and not bid_hit:
        missing.append("price not touching a >500 BTC book wall")
    if inflow and ask_hit and cvd > 0:
        missing.append("CVD not confirming sell")
    if outflow and bid_hit and cvd < 0:
        missing.append("CVD not confirming buy")
    return {
        "signal": "WAIT",
        "wall": ask_hit or bid_hit,
        "why": "M1 confluence waiting: " + ("; ".join(missing) or "filters not aligned") + ".",
    }


def send_email_alert(plan: dict[str, Any], snap: dict[str, Any]) -> str:
    sender = os.environ.get("EMAIL_SENDER", "").strip()
    password = os.environ.get("EMAIL_APP_PASSWORD", "").strip()
    receiver = os.environ.get("EMAIL_RECEIVER", "").strip() or DEFAULT_EMAIL_RECEIVER
    if not sender or not password:
        return "skipped"
    body = (
        f"{M1_ALERT_SUBJECT}\n\n"
        f"{plan['side']} confluence on the 1-minute chart.\n"
        "On-chain flow + order-book wall + CVD agreed. 5-second anti-spoof passed.\n\n"
        f"Side: {plan['side']}\n"
        f"Entry (Global VWAP at trigger): ${plan['entry']:,.2f}\n"
        f"Stop (other side of whale wall): ${plan['stop']:,.2f}\n"
        f"Take Profit (1:3 R:R): ${plan['takeProfit']:,.2f}\n"
        f"Safe size (1% of $1,000): {plan['sizeBtc']:.6f} BTC\n"
        f"Whale wall: ${plan['wallPrice']:,.2f}\n"
        f"On-chain inflow: {snap['flow']['inflows']:.2f} BTC\n"
        f"On-chain outflow: {snap['flow']['outflows']:.2f} BTC\n"
        f"CVD (M1): {snap['cvd']:.2f}\n"
        f"Live price: ${snap['live']:.2f}\n"
        f"when: {snap['when']}\n\n"
        "Not financial advice.\n"
    )
    msg = EmailMessage()
    msg["Subject"] = M1_ALERT_SUBJECT
    msg["From"] = f"Whale Signal Desk <{sender}>"
    msg["To"] = receiver
    msg.set_content(body)
    try:
        with smtplib.SMTP(GMAIL_SMTP_HOST, GMAIL_SMTP_PORT, timeout=20) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(sender, password)
            smtp.send_message(msg)
        return "sent"
    except Exception as exc:  # noqa: BLE001
        return f"failed:{exc}"[:180]


def snapshot(skip_spoof: bool = False) -> dict[str, Any]:
    with ThreadPoolExecutor(max_workers=8) as pool:
        book_futs = {
            pool.submit(pull_book_with_fallback, ex_id, symbol, label): label
            for ex_id, symbol, label in ROUTES
        }
        ohlcv_futs = [
            pool.submit(pull_ohlcv, ex_id, symbol) for ex_id, symbol, _ in ROUTES
        ]
        delta_fut = pool.submit(binance_delta)
        flow_fut = pool.submit(scan_onchain)
        books = [fut.result() for fut in as_completed(book_futs)]
        ohlcvs = [fut.result() for fut in ohlcv_futs]
        delta = delta_fut.result()
        flow = flow_fut.result()

    goods = [b for b in books if b["ok"] and b["last"] > 0]
    live = sum(b["last"] for b in goods) / len(goods) if goods else 0.0
    bid_levels = [(p, q, b["name"]) for b in books for p, q in b["bids"]]
    ask_levels = [(p, q, b["name"]) for b in books for p, q in b["asks"]]
    bid_walls = cluster_walls(bid_levels, "bid")
    ask_walls = cluster_walls(ask_levels, "ask")
    bars = merge_bars(ohlcvs, delta)
    vwap = session_vwap(bars) or live
    cvd = sum(bar["buyVolume"] - bar["sellVolume"] for bar in bars)
    bar = bars[-1] if bars else None
    decision = decide(flow, live or vwap, bar, ask_walls, bid_walls, cvd)
    spoof_checked = False
    spoof_cleared = False
    if decision["signal"] in {"BUY", "SELL"} and decision["wall"] and not skip_spoof:
        spoof_checked = True
        time.sleep(SPOOF_SEC)
        books2 = [
            pull_book_with_fallback(ex_id, symbol, label) for ex_id, symbol, label in ROUTES
        ]
        bid_walls = cluster_walls(
            [(p, q, b["name"]) for b in books2 for p, q in b["bids"]], "bid"
        )
        ask_walls = cluster_walls(
            [(p, q, b["name"]) for b in books2 for p, q in b["asks"]], "ask"
        )
        still = wall_still_real(
            decision["wall"],
            ask_walls if decision["wall"]["side"] == "ask" else bid_walls,
        )
        spoof_cleared = still
        if not still:
            decision = {
                "signal": "WAIT",
                "wall": decision["wall"],
                "why": "Anti-spoof: the >500 BTC wall vanished or shrank inside 5 seconds. No M1 fire.",
            }
        else:
            decision = decide(flow, live or vwap, bar, ask_walls, bid_walls, cvd)
            spoof_cleared = decision["signal"] in {"BUY", "SELL"}
    plan = None
    if decision["signal"] in {"BUY", "SELL"} and decision["wall"]:
        plan = build_plan(decision["signal"], vwap, decision["wall"])
    return {
        "ok": bool(goods and bars),
        "live": round_px(live or vwap),
        "vwap": round_px(vwap),
        "cvd": round_px(cvd),
        "signal": decision["signal"],
        "why": decision["why"],
        "plan": plan,
        "flow": flow,
        "bid_walls": bid_walls[:6],
        "ask_walls": ask_walls[:6],
        "venues": [{"name": b["name"], "ok": b["ok"], "last": round_px(b["last"])} for b in books],
        "spoof_checked": spoof_checked,
        "spoof_cleared": spoof_cleared,
        "candle": candle_key(),
        "when": utc_now(),
        "source": " + ".join(b["name"] for b in goods) or "none",
    }


def render(snap: dict[str, Any]) -> str:
    lines = [
        f"Whale Signal Desk  M1  {snap['when']}",
        f"live ${snap['live']:,.2f}  VWAP ${snap['vwap']:,.2f}  CVD {snap['cvd']:.2f}",
        f"inflow {snap['flow']['inflows']:.2f} BTC  outflow {snap['flow']['outflows']:.2f} BTC",
        f"signal {snap['signal']}  {snap['why']}",
        f"venues {snap['source']}",
    ]
    if snap["plan"]:
        p = snap["plan"]
        lines.append(
            f"{p['side']} ENTRY ${p['entry']:,.2f}  SL ${p['stop']:,.2f}  TP ${p['takeProfit']:,.2f}  size {p['sizeBtc']:.6f} BTC"
        )
    for wall in snap["ask_walls"][:3]:
        tag = "WHALE" if wall["whale"] else "size"
        lines.append(f"ASK {tag} ${wall['price']:,.2f}  {wall['btc']:.0f} BTC")
    for wall in snap["bid_walls"][:3]:
        tag = "WHALE" if wall["whale"] else "size"
        lines.append(f"BID {tag} ${wall['price']:,.2f}  {wall['btc']:.0f} BTC")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="M1 whale confluence bot")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    emailed_candle: int | None = None
    while True:
        snap = snapshot()
        print("\n" + render(snap), flush=True)
        if snap["signal"] in {"BUY", "SELL"} and snap["plan"] and emailed_candle != snap["candle"]:
            status = send_email_alert(snap["plan"], snap)
            emailed_candle = snap["candle"]
            print(f"email {status}  subject {M1_ALERT_SUBJECT}", flush=True)
        if args.once:
            return 0 if snap["ok"] else 1
        time.sleep(LOOP_SEC)


if __name__ == "__main__":
    raise SystemExit(main())
