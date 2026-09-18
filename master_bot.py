#!/usr/bin/env python3
"""
master_bot.py
Global Crypto Market Aggregator & Signal Engine

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
import re
import sys
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Optional ccxt (required for live books + OHLCV)
# ---------------------------------------------------------------------------
try:
    import ccxt  # type: ignore
except ImportError:  # pragma: no cover
    print("Missing dependency: pip install ccxt", file=sys.stderr)
    sys.exit(1)


# ===========================================================================
# Constants
# ===========================================================================

SATS = 100_000_000
WHALE_BTC = 100.0
BOOK_LIMIT = 50
NEAR_PCT = 0.01
SELL_WALL_RATIO = 2.0
RSI_LEN = 14
ATR_LEN = 14
RSI_OVERBOUGHT = 70.0
RSI_BREAKOUT = 75.0
RSI_OVERSOLD = 30.0
ATR_SPIKE_MULT = 1.5
SL_ATR_MULT = 1.5
RR_MULT = 3.0
BREAKEVEN_FRAC = 0.50
ETF_BULL_USD = 100_000_000.0
WALLET_USD = 1_000.0
RISK_PCT = 0.01
LOOP_SEC = 10
HTTP_TIMEOUT = 12
OHLCV_TF = "5m"
OHLCV_LIMIT = 120
USER_AGENT = (
    "Mozilla/5.0 (compatible; MasterBot/1.0; +https://github.com/EILUMIN/btc-whale-signals)"
)

MEMPOOL_API = os.environ.get("MEMPOOL_API_BASE", "https://mempool.space/api").rstrip("/")
FARSIDE_URL = "https://farside.co.uk/BTC/"
SOSO_URL = (
    "https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart"
    "?type=us-btc-spot"
)

# Publicly labeled exchange clusters (BitInfoCharts / community labels).
EXCHANGE_WALLETS: dict[str, str] = {
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": "Binance",
    "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97": "Binance",
    "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6": "Binance",
    "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": "Binance",
    "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": "Binance",
    "3JZq4atUahhuA9rLh7JfTUiCTCoRg3S8oS": "Binance",
    "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": "Binance",
    "1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ": "Binance",
    "385cR5DM96n1HvBDMzLHPYcw89fZAXULJP": "Binance",
    "1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd": "Binance",
    "3LQeSjqS5a2sJDfcQpCUEGmCUS9skryALt": "Binance",
    "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": "Coinbase",
    "3Nxwenay9Z8Lc9JBiywTo1sZkyn2nQaaKR": "Coinbase",
    "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r": "Bitfinex",
    "1Kr6QSydW9bFQG1mXiPNNu6WpJGmUa9i1g": "Bitfinex",
    "bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt": "Bitfinex",
    "1FfmbHfnpaZjKFvyi1okTjJJusN455paPH": "Bitfinex",
    "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2": "OKX",
    "bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6": "OKX",
    "bc1q5shngj24323nsrmxv99st02na6srekfctt30ch": "Kraken",
    "3FupZp77ySr7jwoLYEJ9mwzJpvoNBXsBnE": "Kraken",
    "3BMEXqGpG4FxBA1KWhRFufXfSTRgzfDBhJ": "BitMEX",
    "3BMEXDR3sAq2xDx2SSivNT6BGUjrF4oGCX": "BitMEX",
    "1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ": "HTX",
    "1KYiKJEfdJtap9QX2v9BxAdVwzSpoVu4Uo": "Bitstamp",
    "3NNsvp7dfevkKqwkM6ZPZ2huUMPtFP1166": "Bittrex",
}

# ANSI
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GRN = "\033[32m"
YEL = "\033[33m"
BLU = "\033[34m"
CYN = "\033[36m"
WHT = "\033[97m"


# ===========================================================================
# Small helpers
# ===========================================================================

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().strftime("%Y-%m-%d %H:%M:%S UTC")


def money(value: float | None, digits: int = 2) -> str:
    if value is None or not isinstance(value, (int, float)):
        return "—"
    return f"${value:,.{digits}f}"


def btc_fmt(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.4f} BTC"


def clamp(n: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, n))


def is_exchange(addr: str | None) -> bool:
    if not addr:
        return False
    return addr in EXCHANGE_WALLETS


def http_get(url: str, timeout: int = HTTP_TIMEOUT) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def http_json(url: str, timeout: int = HTTP_TIMEOUT) -> Any:
    return json.loads(http_get(url, timeout=timeout).decode("utf-8", "replace"))


# ===========================================================================
# MODULE 1 — Global Liquidity Aggregator (Order Flow Force)
# ===========================================================================

@dataclass
class VenueBook:
    name: str
    symbol: str
    bid: float = 0.0
    ask: float = 0.0
    last: float = 0.0
    bids_near: float = 0.0
    asks_near: float = 0.0
    spread: float = 0.0
    ok: bool = False
    error: str = ""


@dataclass
class LiquiditySnapshot:
    venues: list[VenueBook] = field(default_factory=list)
    live: float = 0.0
    spread: float = 0.0
    bids_near: float = 0.0
    asks_near: float = 0.0
    ask_bid_ratio: float = 0.0
    heavy_sell: bool = False
    heavy_buy: bool = False
    pressure: str = "NEUTRAL"


def _levels(side: Any) -> list[tuple[float, float]]:
    rows: list[tuple[float, float]] = []
    for item in side or []:
        try:
            price, amount = float(item[0]), float(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        rows.append((price, amount))
    return rows


def _make_exchange(ex_id: str) -> Any:
    klass = getattr(ccxt, ex_id)
    return klass(
        {
            "enableRateLimit": True,
            "timeout": HTTP_TIMEOUT * 1000,
            "options": {"defaultType": "spot"},
        }
    )


def _pull_book(ex_id: str, symbol: str, live_hint: float) -> VenueBook:
    row = VenueBook(name=ex_id, symbol=symbol)
    try:
        ex = _make_exchange(ex_id)
        ticker = ex.fetch_ticker(symbol)
        last = float(ticker.get("last") or ticker.get("close") or 0.0)
        book = ex.fetch_order_book(symbol, limit=BOOK_LIMIT)
        bids = _levels(book.get("bids"))
        asks = _levels(book.get("asks"))
        bid = float(bids[0][0]) if bids else last
        ask = float(asks[0][0]) if asks else last
        mid = (bid + ask) / 2.0 if bid and ask else last
        ref = live_hint or mid or last
        lo, hi = ref * (1.0 - NEAR_PCT), ref * (1.0 + NEAR_PCT)
        bids_near = sum(float(s) for p, s in bids if float(p) >= lo)
        asks_near = sum(float(s) for p, s in asks if float(p) <= hi)
        row.bid = bid
        row.ask = ask
        row.last = last or mid
        row.bids_near = bids_near
        row.asks_near = asks_near
        row.spread = ask - bid if ask and bid else 0.0
        row.ok = True
    except Exception as exc:  # noqa: BLE001 — venue isolation
        row.error = str(exc)[:160]
    return row


class LiquidityAggregator:
    """Binance + Coinbase + Kraken public order books, merged within 1% of live."""

    def __init__(self) -> None:
        self.routes: list[tuple[str, str]] = [
            ("binance", "BTC/USDT"),
            ("coinbaseexchange", "BTC/USD"),
            ("kraken", "BTC/USD"),
        ]
        self._fallbacks = {
            "binance": ("binanceus", "BTC/USD"),
            "coinbaseexchange": ("coinbase", "BTC/USD"),
        }

    def fetch(self) -> LiquiditySnapshot:
        snap = LiquiditySnapshot()
        with ThreadPoolExecutor(max_workers=3) as pool:
            futs = [pool.submit(_pull_book, ex, sym, 0.0) for ex, sym in self.routes]
            books = [f.result() for f in as_completed(futs)]

        repaired: list[VenueBook] = []
        for book in books:
            if not book.ok and book.name in self._fallbacks:
                fb = _pull_book(*self._fallbacks[book.name], 0.0)
                repaired.append(fb)
            else:
                repaired.append(book)
        snap.venues = sorted(repaired, key=lambda b: b.name)

        goods = [v for v in snap.venues if v.ok and v.last > 0]
        if not goods:
            snap.pressure = "NO BOOK DATA"
            return snap

        snap.live = sum(v.last for v in goods) / len(goods)
        # Re-sum near-touch using the global live mid (second pass, cheap).
        snap.bids_near = sum(v.bids_near for v in goods)
        snap.asks_near = sum(v.asks_near for v in goods)
        snap.spread = sum(v.spread for v in goods) / len(goods)
        if snap.bids_near > 0:
            snap.ask_bid_ratio = snap.asks_near / snap.bids_near
        elif snap.asks_near > 0:
            snap.ask_bid_ratio = float("inf")
        snap.heavy_sell = snap.asks_near >= SELL_WALL_RATIO * max(snap.bids_near, 1e-9)
        snap.heavy_buy = snap.bids_near >= SELL_WALL_RATIO * max(snap.asks_near, 1e-9)
        if snap.heavy_sell:
            snap.pressure = "HEAVY INSTITUTIONAL SELLING PRESSURE"
        elif snap.heavy_buy:
            snap.pressure = "HEAVY INSTITUTIONAL BUYING PRESSURE"
        else:
            snap.pressure = "BALANCED BOOK"
        return snap


# ===========================================================================
# MODULE 2 — On-chain Supply Tracker (Whale Inflow / Outflow Force)
# Public REST: Mempool.space Esplora (same chain data Whale Alert reads).
# ===========================================================================

@dataclass
class WhaleTx:
    txid: str
    btc: float
    kind: str  # inflow | outflow | internal | unlabeled
    when: str
    origin: str
    dest: str


@dataclass
class WhaleSnapshot:
    inflows: float = 0.0
    outflows: float = 0.0
    netflow: float = 0.0
    sentiment: str = "NEUTRAL"
    prints: list[WhaleTx] = field(default_factory=list)
    error: str = ""


def _classify_tx(tx: dict[str, Any]) -> WhaleTx | None:
    txid = str(tx.get("txid") or "")
    vins = tx.get("vin") or []
    vouts = tx.get("vout") or []
    from_ex = False
    to_ex = False
    from_label = "wallet"
    to_label = "wallet"
    total_sats = 0
    for vin in vins:
        prev = vin.get("prevout") or {}
        addr = prev.get("scriptpubkey_address")
        if is_exchange(addr):
            from_ex = True
            from_label = EXCHANGE_WALLETS.get(addr or "", "exchange")
    for vout in vouts:
        addr = vout.get("scriptpubkey_address")
        total_sats += int(vout.get("value") or 0)
        if is_exchange(addr):
            to_ex = True
            to_label = EXCHANGE_WALLETS.get(addr or "", "exchange")
    btc = total_sats / SATS
    if btc < WHALE_BTC:
        return None
    if from_ex and to_ex:
        kind = "internal"
    elif to_ex and not from_ex:
        kind = "inflow"
    elif from_ex and not to_ex:
        kind = "outflow"
    else:
        kind = "unlabeled"
    status = tx.get("status") or {}
    ts = status.get("block_time") or int(time.time())
    when = datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return WhaleTx(
        txid=txid,
        btc=btc,
        kind=kind,
        when=when,
        origin=from_label,
        dest=to_label,
    )


class OnchainTracker:
    def __init__(self) -> None:
        self.seen: dict[str, WhaleTx] = {}
        self.cursor = 0
        self.addresses = list(EXCHANGE_WALLETS.keys())

    def _ingest(self, txid: str) -> None:
        if txid in self.seen:
            return
        try:
            tx = http_json(f"{MEMPOOL_API}/tx/{txid}")
            row = _classify_tx(tx)
            if row:
                self.seen[txid] = row
        except Exception:
            return

    def fetch(self) -> WhaleSnapshot:
        snap = WhaleSnapshot()
        try:
            recent = http_json(f"{MEMPOOL_API}/mempool/recent")
            if isinstance(recent, list):
                for item in recent:
                    value = int(item.get("value") or 0)
                    txid = item.get("txid")
                    if txid and value >= WHALE_BTC * SATS:
                        self._ingest(str(txid))

            # Rotate a few labeled exchange wallets each cycle.
            batch = 3
            start = self.cursor % max(len(self.addresses), 1)
            for i in range(batch):
                addr = self.addresses[(start + i) % len(self.addresses)]
                try:
                    txs = http_json(f"{MEMPOOL_API}/address/{addr}/txs")
                    if isinstance(txs, list):
                        for tx in txs[:6]:
                            row = _classify_tx(tx)
                            if row:
                                self.seen[row.txid] = row
                except Exception:
                    continue
                time.sleep(0.12)
            self.cursor = (start + batch) % len(self.addresses)
        except Exception as exc:  # noqa: BLE001
            snap.error = str(exc)[:160]

        # Rolling 24h window
        cutoff = time.time() - 24 * 3600
        live: list[WhaleTx] = []
        for row in self.seen.values():
            try:
                ts = datetime.strptime(row.when, "%Y-%m-%d %H:%M UTC").replace(
                    tzinfo=timezone.utc
                ).timestamp()
            except ValueError:
                ts = time.time()
            if ts >= cutoff:
                live.append(row)
        snap.prints = sorted(live, key=lambda r: r.btc, reverse=True)[:12]
        snap.inflows = sum(r.btc for r in live if r.kind == "inflow")
        snap.outflows = sum(r.btc for r in live if r.kind == "outflow")
        snap.netflow = snap.inflows - snap.outflows
        if snap.netflow > 0:
            snap.sentiment = "POSITIVE NETFLOW (+)  selling pressure (in > out)"
        elif snap.netflow < 0:
            snap.sentiment = "NEGATIVE NETFLOW (−)  accumulation (out > in)"
        else:
            snap.sentiment = "FLAT NETFLOW"
        return snap


# ===========================================================================
# MODULE 3 — Institutional ETF Flow Monitor (Wall Street Force)
# Public HTML: Farside Investors. JSON fallback: SoSoValue open API.
# ===========================================================================

@dataclass
class EtfSnapshot:
    date: str = "—"
    total_usd: float = 0.0
    ibit_usd: float = 0.0
    fbtc_usd: float = 0.0
    sentiment: str = "NEUTRAL / NO PRINT"
    source: str = ""
    error: str = ""
    fetched_at: float = 0.0


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] = []
        self._cell = False
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        if tag in {"td", "th"}:
            self._cell = True
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._cell:
            self._row.append("".join(self._buf).strip())
            self._cell = False
        if tag == "tr" and self._row:
            self.rows.append(self._row)

    def handle_data(self, data: str) -> None:
        if self._cell:
            self._buf.append(data)


_DATE = re.compile(
    r"^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}$",
    re.I,
)


def _to_million(cell: str) -> float | None:
    raw = cell.strip().replace(",", "").replace("–", "-").replace("—", "-")
    if raw in {"", "-", "–", "—"}:
        return None
    neg = raw.startswith("(") and raw.endswith(")")
    raw = raw.replace("(", "").replace(")", "")
    try:
        value = float(raw)
    except ValueError:
        return None
    return -abs(value) if neg or value < 0 else value


class EtfMonitor:
    def __init__(self) -> None:
        self.cache: EtfSnapshot | None = None
        self.ttl = 15 * 60

    def fetch(self) -> EtfSnapshot:
        if self.cache and time.time() - self.cache.fetched_at < self.ttl:
            return self.cache
        snap = self._from_farside()
        if snap.date == "—" or snap.error:
            alt = self._from_soso()
            if alt.date != "—":
                snap = alt
        snap.fetched_at = time.time()
        if snap.total_usd >= ETF_BULL_USD:
            snap.sentiment = "BULLISH APPRECIATION"
        elif snap.total_usd < 0:
            snap.sentiment = "BEARISH DISTRIBUTION"
        elif snap.date != "—":
            snap.sentiment = "NEUTRAL / LIGHT FLOW"
        self.cache = snap
        return snap

    def _from_farside(self) -> EtfSnapshot:
        snap = EtfSnapshot(source="Farside Investors (public HTML)")
        try:
            html = http_get(FARSIDE_URL).decode("utf-8", "replace")
            parser = _TableParser()
            parser.feed(html)
            header: list[str] = []
            dated: list[tuple[str, list[str]]] = []
            for row in parser.rows:
                cells = [c.strip() for c in row if c.strip() != ""]
                if not cells:
                    continue
                if any(c.upper() == "IBIT" for c in cells) and any(
                    c.upper() == "FBTC" for c in cells
                ):
                    header = [c.upper() for c in cells]
                    continue
                if _DATE.match(cells[0]):
                    dated.append((cells[0], cells))
            if not dated:
                snap.error = "Farside table had no dated rows"
                return snap
            # Skip pending "dash" days (today often prints '-' / 0.0).
            chosen = None
            for date, cells in reversed(dated):
                nums = [c for c in cells[1:] if _to_million(c) is not None]
                total = _to_million(cells[-1]) if cells else None
                if total is None:
                    continue
                # A fully pending row is all dashes / zeros with a 0.0 total.
                if abs(total) < 1e-9 and all(
                    (_to_million(c) or 0.0) == 0.0 for c in cells[1:]
                ):
                    continue
                chosen = (date, cells, header, total)
                break
            if not chosen:
                snap.error = "No completed Farside session yet"
                return snap
            date, cells, header, total = chosen
            snap.date = date
            snap.total_usd = float(total) * 1_000_000.0
            funds = [c for c in header if c not in {"", "TOTAL", "FEE"}]
            values = cells[1:]
            by_fund: dict[str, float] = {}
            for name, raw in zip(funds, values):
                parsed = _to_million(raw)
                if parsed is not None:
                    by_fund[name] = parsed * 1_000_000.0
            snap.ibit_usd = by_fund.get("IBIT", 0.0)
            snap.fbtc_usd = by_fund.get("FBTC", 0.0)
            if values:
                last = _to_million(values[-1])
                if last is not None:
                    snap.total_usd = last * 1_000_000.0
        except Exception as exc:  # noqa: BLE001
            snap.error = str(exc)[:160]
        return snap

    def _from_soso(self) -> EtfSnapshot:
        snap = EtfSnapshot(source="SoSoValue public API")
        try:
            payload = http_json(SOSO_URL)
            rows = payload.get("data") or payload.get("list") or payload
            if isinstance(rows, dict):
                rows = rows.get("list") or rows.get("data") or []
            if not isinstance(rows, list) or not rows:
                snap.error = "SoSoValue empty"
                return snap
            last = rows[-1]
            snap.date = str(last.get("date") or last.get("time") or "latest")
            total = float(last.get("totalNetInflow") or last.get("value") or 0.0)
            # Some feeds are already in USD, some in millions.
            snap.total_usd = total if abs(total) > 10_000 else total * 1_000_000.0
        except Exception as exc:  # noqa: BLE001
            snap.error = str(exc)[:160]
        return snap


# ===========================================================================
# MODULE 4 — Technical Execution & Momentum Guard
# Combined 3-exchange OHLCV → RSI(14), ATR(14), VWAP
# ===========================================================================

@dataclass
class TechSnapshot:
    rsi: float = 0.0
    rsi_prev: float = 0.0
    atr: float = 0.0
    atr_avg: float = 0.0
    vwap: float = 0.0
    volume: float = 0.0
    cross_below_70: bool = False
    recover_from_30: bool = False
    atr_spike: bool = False
    breakout_lock: bool = False
    bars: int = 0
    error: str = ""


def _wilder_rsi(closes: list[float], length: int = RSI_LEN) -> list[float]:
    if len(closes) < length + 1:
        return []
    gains, losses = [], []
    for i in range(1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gains.append(max(delta, 0.0))
        losses.append(max(-delta, 0.0))
    avg_g = sum(gains[:length]) / length
    avg_l = sum(losses[:length]) / length
    out: list[float] = []
    for i in range(length, len(gains)):
        avg_g = (avg_g * (length - 1) + gains[i]) / length
        avg_l = (avg_l * (length - 1) + losses[i]) / length
        rs = avg_g / avg_l if avg_l else 100.0
        out.append(100.0 - (100.0 / (1.0 + rs)))
    # Seed first RSI after initial average
    rs0 = (sum(gains[:length]) / length) / (sum(losses[:length]) / length or 1e-12)
    first = 100.0 - (100.0 / (1.0 + rs0))
    return [first] + out


def _wilder_atr(highs: list[float], lows: list[float], closes: list[float], length: int = ATR_LEN) -> list[float]:
    if len(closes) < length + 1:
        return []
    trs: list[float] = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        trs.append(tr)
    atr = sum(trs[:length]) / length
    out = [atr]
    for tr in trs[length:]:
        atr = (atr * (length - 1) + tr) / length
        out.append(atr)
    return out


class MomentumGuard:
    def __init__(self) -> None:
        self.rsi_hist: deque[float] = deque(maxlen=8)

    def fetch(self) -> TechSnapshot:
        snap = TechSnapshot()
        routes = [
            ("binance", "BTC/USDT"),
            ("binanceus", "BTC/USD"),
            ("coinbaseexchange", "BTC/USD"),
            ("kraken", "BTC/USD"),
        ]
        series: dict[int, list[tuple[float, float, float, float]]] = {}
        errors: list[str] = []

        def pull(ex_id: str, symbol: str) -> list[list[float]]:
            ex = _make_exchange(ex_id)
            return ex.fetch_ohlcv(symbol, timeframe=OHLCV_TF, limit=OHLCV_LIMIT)

        with ThreadPoolExecutor(max_workers=4) as pool:
            futs = {pool.submit(pull, ex, sym): ex for ex, sym in routes}
            for fut in as_completed(futs):
                name = futs[fut]
                try:
                    candles = fut.result()
                    for ts, o, h, l, c, v in candles:
                        bucket = int(ts)
                        series.setdefault(bucket, []).append(
                            (float(h), float(l), float(c), float(v))
                        )
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{name}: {exc}"[:80])

        if not series:
            snap.error = "; ".join(errors) or "no OHLCV"
            return snap

        stamps = sorted(series)
        highs, lows, closes, vols, typical = [], [], [], [], []
        for ts in stamps:
            rows = series[ts]
            h = sum(r[0] for r in rows) / len(rows)
            l = sum(r[1] for r in rows) / len(rows)
            c = sum(r[2] for r in rows) / len(rows)
            v = sum(r[3] for r in rows)
            highs.append(h)
            lows.append(l)
            closes.append(c)
            vols.append(v)
            typical.append(((h + l + c) / 3.0) * v)

        snap.volume = sum(vols[-24:])
        vol_sum = sum(vols) or 1e-9
        snap.vwap = sum(typical) / vol_sum
        rsis = _wilder_rsi(closes, RSI_LEN)
        atrs = _wilder_atr(highs, lows, closes, ATR_LEN)
        snap.bars = len(closes)
        if rsis:
            snap.rsi = rsis[-1]
            snap.rsi_prev = rsis[-2] if len(rsis) > 1 else rsis[-1]
            self.rsi_hist.append(snap.rsi)
        if atrs:
            snap.atr = atrs[-1]
            tail = atrs[-20:] if len(atrs) >= 5 else atrs
            snap.atr_avg = sum(tail) / len(tail)
            snap.atr_spike = snap.atr >= ATR_SPIKE_MULT * max(snap.atr_avg, 1e-9)
        snap.cross_below_70 = snap.rsi_prev >= RSI_OVERBOUGHT and snap.rsi < RSI_OVERBOUGHT
        snap.recover_from_30 = snap.rsi_prev <= RSI_OVERSOLD and snap.rsi > RSI_OVERSOLD
        # Even with whale inflow: do NOT sell into a melt-up.
        snap.breakout_lock = snap.rsi > RSI_BREAKOUT and snap.atr_spike
        if errors and not rsis:
            snap.error = "; ".join(errors)
        return snap


# ===========================================================================
# MODULE 5 — Core Signal Matrix & Risk Math
# ===========================================================================

@dataclass
class TradePlan:
    side: str  # BUY | SELL | NONE
    reason: str
    entry: float = 0.0
    stop: float = 0.0
    take_profit: float = 0.0
    risk_usd: float = 0.0
    size_btc: float = 0.0
    notional: float = 0.0
    rr: float = RR_MULT
    breakeven: bool = False
    blocked: str = ""


@dataclass
class PaperState:
    side: str = "FLAT"
    entry: float = 0.0
    stop: float = 0.0
    take_profit: float = 0.0
    size_btc: float = 0.0
    opened_at: str = ""
    breakeven: bool = False


def build_plan(
    liq: LiquiditySnapshot,
    whales: WhaleSnapshot,
    tech: TechSnapshot,
    wallet: float,
    live: float,
    paper: PaperState,
) -> TradePlan:
    entry = tech.vwap if tech.vwap > 0 else live
    atr = tech.atr if tech.atr > 0 else entry * 0.004
    risk_usd = wallet * RISK_PCT
    plan = TradePlan(side="NONE", reason="No confluence yet.", entry=entry)

    blocked = []
    if tech.breakout_lock:
        blocked.append(
            "SELL forbidden: RSI>75 + ATR spike (breakout). Do not fade the melt-up."
        )
    plan.blocked = " | ".join(blocked)

    want_sell = (
        whales.netflow > 0
        and liq.heavy_sell
        and tech.cross_below_70
        and not tech.breakout_lock
    )
    want_buy = whales.netflow < 0 and liq.heavy_buy and tech.recover_from_30

    if want_sell:
        stop = entry + SL_ATR_MULT * atr
        risk = stop - entry
        tp = entry - RR_MULT * risk
        size = risk_usd / risk if risk > 0 else 0.0
        plan = TradePlan(
            side="SELL",
            reason=(
                "Netflow (+) whale inflow to exchanges + heavy ask walls "
                "+ RSI crossed back below 70 (exhaustion)."
            ),
            entry=entry,
            stop=stop,
            take_profit=tp,
            risk_usd=risk_usd,
            size_btc=size,
            notional=size * entry,
            blocked=plan.blocked,
        )
    elif want_buy:
        stop = entry - SL_ATR_MULT * atr
        risk = entry - stop
        tp = entry + RR_MULT * risk
        size = risk_usd / risk if risk > 0 else 0.0
        plan = TradePlan(
            side="BUY",
            reason=(
                "Netflow (−) whale outflow to cold wallets + heavy bid walls "
                "+ RSI recovered from oversold (<30)."
            ),
            entry=entry,
            stop=stop,
            take_profit=tp,
            risk_usd=risk_usd,
            size_btc=size,
            notional=size * entry,
            blocked=plan.blocked,
        )
    else:
        bits = []
        if whales.netflow <= 0:
            bits.append("netflow not (+)")
        if not liq.heavy_sell:
            bits.append("no 2× sell wall")
        if not tech.cross_below_70:
            bits.append("RSI has not crossed below 70")
        sell_miss = ", ".join(bits)
        bits_b = []
        if whales.netflow >= 0:
            bits_b.append("netflow not (−)")
        if not liq.heavy_buy:
            bits_b.append("no 2× buy wall")
        if not tech.recover_from_30:
            bits_b.append("RSI has not lifted from <30")
        plan.reason = f"SELL needs: {sell_miss}. BUY needs: {', '.join(bits_b)}."

    # Paper position + breakeven guard (50% of path to TP → stop = entry).
    if plan.side in {"BUY", "SELL"} and paper.side == "FLAT":
        paper.side = plan.side
        paper.entry = plan.entry
        paper.stop = plan.stop
        paper.take_profit = plan.take_profit
        paper.size_btc = plan.size_btc
        paper.opened_at = iso_now()
        paper.breakeven = False

    if paper.side == "SELL" and paper.entry and paper.take_profit:
        path = paper.entry - paper.take_profit
        if path > 0 and (paper.entry - live) >= BREAKEVEN_FRAC * path:
            paper.stop = paper.entry
            paper.breakeven = True
    if paper.side == "BUY" and paper.entry and paper.take_profit:
        path = paper.take_profit - paper.entry
        if path > 0 and (live - paper.entry) >= BREAKEVEN_FRAC * path:
            paper.stop = paper.entry
            paper.breakeven = True

    if paper.side == "SELL" and live >= paper.stop > 0:
        paper.side = "FLAT"
        paper.breakeven = False
        plan.reason += "  Paper short stopped out."
    if paper.side == "BUY" and 0 < live <= paper.stop:
        paper.side = "FLAT"
        paper.breakeven = False
        plan.reason += "  Paper long stopped out."
    if paper.side == "SELL" and paper.take_profit and live <= paper.take_profit:
        paper.side = "FLAT"
        plan.reason += "  Paper short hit TP."
    if paper.side == "BUY" and paper.take_profit and live >= paper.take_profit:
        paper.side = "FLAT"
        plan.reason += "  Paper long hit TP."

    plan.breakeven = paper.breakeven
    if paper.side != "FLAT":
        plan.stop = paper.stop
        plan.take_profit = paper.take_profit
        plan.entry = paper.entry
        plan.size_btc = paper.size_btc
        plan.notional = paper.size_btc * paper.entry
        plan.side = paper.side if plan.side == "NONE" else plan.side
    return plan


# ===========================================================================
# Terminal dashboard
# ===========================================================================

def _line(width: int, ch: str = "─") -> str:
    return ch * width


def render(
    liq: LiquiditySnapshot,
    whales: WhaleSnapshot,
    etf: EtfSnapshot,
    tech: TechSnapshot,
    plan: TradePlan,
    paper: PaperState,
    wallet: float,
    cycle: int,
) -> str:
    try:
        cols = os.get_terminal_size().columns if sys.stdout.isatty() else 88
    except OSError:
        cols = 88
    width = clamp(int(cols), 72, 110)
    live = liq.live or tech.vwap
    side_col = RED if plan.side == "SELL" else GRN if plan.side == "BUY" else YEL
    lock = f"{RED}ON — no fade{RESET}" if tech.breakout_lock else f"{GRN}OFF{RESET}"
    be = (
        f"{GRN}ARMED — stop moved to entry (zero risk){RESET}"
        if paper.breakeven
        else f"{DIM}waiting for 50% path to TP{RESET}"
    )

    def box(title: str) -> str:
        return f"{CYN}{BOLD}{title}{RESET}"

    out: list[str] = []
    out.append(f"{BLU}{BOLD}{'═' * width}{RESET}")
    out.append(
        f"{WHT}{BOLD}  GLOBAL CRYPTO MARKET AGGREGATOR & SIGNAL ENGINE{RESET}  {DIM}cycle {cycle} · {iso_now()}{RESET}"
    )
    out.append(
        f"{DIM}  Public feeds only · Binance / Coinbase / Kraken · Mempool.space · Farside ETF · no private keys{RESET}"
    )
    out.append(f"{BLU}{BOLD}{'═' * width}{RESET}")
    out.append("")
    out.append(
        f"  {BOLD}LIVE GLOBAL PRICE{RESET}  {WHT}{BOLD}{money(live)}{RESET}    "
        f"VWAP {money(tech.vwap)}    spread {money(liq.spread)}"
    )
    out.append("")
    out.append(box("  MODULE 1  ·  ORDER FLOW FORCE"))
    for v in liq.venues:
        if v.ok:
            out.append(
                f"    {v.name:<18} {v.symbol:<9}  bid {money(v.bid)}  ask {money(v.ask)}  "
                f"near bids {v.bids_near:,.2f}  near asks {v.asks_near:,.2f}"
            )
        else:
            out.append(f"    {v.name:<18} {RED}offline{RESET}  {DIM}{v.error}{RESET}")
    ratio = "∞" if liq.ask_bid_ratio == float("inf") else f"{liq.ask_bid_ratio:.2f}x"
    wall_col = RED if liq.heavy_sell else GRN if liq.heavy_buy else DIM
    out.append(
        f"    Combined within 1% of live → bids {liq.bids_near:,.2f} BTC   "
        f"asks {liq.asks_near:,.2f} BTC   ratio {ratio}"
    )
    out.append(f"    {wall_col}{BOLD}{liq.pressure}{RESET}")
    out.append("")
    out.append(box("  MODULE 2  ·  WHALE INFLOW / OUTFLOW  (>100 BTC, 24h)"))
    if whales.error:
        out.append(f"    {YEL}feed: {whales.error}{RESET}")
    out.append(
        f"    Inflows  (wallet → exchange, pinasok)   {RED}{btc_fmt(whales.inflows)}{RESET}"
    )
    out.append(
        f"    Outflows (exchange → wallet, nilabas)   {GRN}{btc_fmt(whales.outflows)}{RESET}"
    )
    nf_col = RED if whales.netflow > 0 else GRN if whales.netflow < 0 else DIM
    out.append(f"    Netflow (in − out)  {nf_col}{BOLD}{whales.netflow:+,.4f} BTC{RESET}  {whales.sentiment}")
    if whales.prints:
        for p in whales.prints[:4]:
            tag = {
                "inflow": f"{RED}IN {RESET}",
                "outflow": f"{GRN}OUT{RESET}",
                "internal": f"{YEL}INT{RESET}",
            }.get(p.kind, " · ")
            out.append(
                f"      {tag} {btc_fmt(p.btc):>14}  {p.origin} → {p.dest}  {DIM}{p.when}  {p.txid[:12]}…{RESET}"
            )
    else:
        out.append(f"    {DIM}No >{WHALE_BTC:.0f} BTC labeled flow in the current window.{RESET}")
    out.append("")
    out.append(box("  MODULE 3  ·  WALL STREET ETF FORCE  (IBIT / FBTC)"))
    etf_col = GRN if etf.sentiment.startswith("BULL") else RED if etf.sentiment.startswith("BEAR") else DIM
    out.append(
        f"    {etf.date}  total {money(etf.total_usd, 0)}   "
        f"IBIT {money(etf.ibit_usd, 0)}   FBTC {money(etf.fbtc_usd, 0)}"
    )
    out.append(f"    {etf_col}{BOLD}{etf.sentiment}{RESET}  {DIM}{etf.source}{RESET}")
    if etf.error:
        out.append(f"    {YEL}{etf.error}{RESET}")
    out.append("")
    out.append(box("  MODULE 4  ·  MOMENTUM GUARD  (RSI 14 / ATR 14 / VWAP)"))
    out.append(
        f"    RSI {tech.rsi:6.2f}  (prev {tech.rsi_prev:6.2f})    "
        f"cross below 70: {'YES' if tech.cross_below_70 else 'no':<3}    "
        f"lift from <30: {'YES' if tech.recover_from_30 else 'no'}"
    )
    out.append(
        f"    ATR {money(tech.atr)}  avg {money(tech.atr_avg)}  spike {'YES' if tech.atr_spike else 'no'}    "
        f"5m volume {tech.volume:,.2f}    bars {tech.bars}"
    )
    out.append(f"    Breakout lock (RSI>75 + ATR spike): {lock}")
    if tech.error:
        out.append(f"    {YEL}{tech.error}{RESET}")
    out.append("")
    out.append(box("  MODULE 5  ·  SIGNAL MATRIX & 1:3 RISK MATH"))
    out.append(f"    {side_col}{BOLD}SIGNAL  {plan.side}{RESET}    {plan.reason}")
    if plan.blocked:
        out.append(f"    {RED}{plan.blocked}{RESET}")
    if plan.side in {"BUY", "SELL"} or paper.side != "FLAT":
        out.append(f"    ENTRY        {money(plan.entry)}   (global VWAP)")
        out.append(
            f"    STOP LOSS    {money(plan.stop)}   "
            f"({'price + 1.5×ATR' if (plan.side == 'SELL' or paper.side == 'SELL') else 'price − 1.5×ATR'})"
        )
        out.append(f"    TAKE PROFIT  {money(plan.take_profit)}   (3× stop distance, 1:3 R:R)")
        out.append(
            f"    SIZE         {btc_fmt(plan.size_btc)}    notional {money(plan.notional)}    "
            f"risk {money(plan.risk_usd or wallet * RISK_PCT)}  (1% of {money(wallet)} wallet)"
        )
        out.append(f"    BREAKEVEN    {be}")
        if paper.side != "FLAT":
            out.append(
                f"    PAPER        {paper.side} opened {paper.opened_at}  "
                f"live {money(live)}"
            )
    out.append("")
    out.append(
        f"{DIM}  SELL only if netflow (+) AND 2× ask wall AND RSI crosses below 70.  "
        f"BUY only if netflow (−) AND 2× bid wall AND RSI lifts from <30.{RESET}"
    )
    out.append(
        f"{DIM}  Not financial advice. Public data can lag. Ctrl+C to stop.{RESET}"
    )
    out.append(_line(width))
    return "\n".join(out)


# ===========================================================================
# Main loop
# ===========================================================================

def run(once: bool, interval: float, wallet: float) -> None:
    liq_eng = LiquidityAggregator()
    chain = OnchainTracker()
    etf_eng = EtfMonitor()
    tech_eng = MomentumGuard()
    paper = PaperState()
    cycle = 0
    print(
        f"{CYN}Booting public feeds (Binance / Coinbase / Kraken / Mempool / Farside)…{RESET}",
        flush=True,
    )
    while True:
        cycle += 1
        try:
            liq = liq_eng.fetch()
        except Exception as exc:  # noqa: BLE001
            liq = LiquiditySnapshot(pressure=f"error {exc}")
        try:
            whales = chain.fetch()
        except Exception as exc:  # noqa: BLE001
            whales = WhaleSnapshot(error=str(exc)[:160])
        try:
            etf = etf_eng.fetch()
        except Exception as exc:  # noqa: BLE001
            etf = EtfSnapshot(error=str(exc)[:160])
        try:
            tech = tech_eng.fetch()
        except Exception as exc:  # noqa: BLE001
            tech = TechSnapshot(error=str(exc)[:160])

        live = liq.live or tech.vwap
        plan = build_plan(liq, whales, tech, wallet, live, paper)
        frame = render(liq, whales, etf, tech, plan, paper, wallet, cycle)
        if sys.stdout.isatty() and not once:
            sys.stdout.write("\033[2J\033[H")
        print(frame, flush=True)
        if once:
            return
        time.sleep(max(1.0, interval))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Global Crypto Market Aggregator & Signal Engine (public data only)"
    )
    p.add_argument("--once", action="store_true", help="one dashboard frame then exit")
    p.add_argument("--interval", type=float, default=LOOP_SEC, help="seconds between frames")
    p.add_argument("--wallet", type=float, default=WALLET_USD, help="paper wallet USD")
    return p.parse_args(argv)


def main() -> None:
    args = parse_args()
    try:
        run(once=args.once, interval=args.interval, wallet=args.wallet)
    except KeyboardInterrupt:
        print(f"\n{DIM}Stopped.{RESET}")


if __name__ == "__main__":
    main()
