# Whale Signal Desk

Local BTC/USD whale tracker. Binabasa nito ang malalaking Bitcoin transaksyon mula sa [Mempool.space](https://mempool.space). Ang **live BTC price** ay nire-refresh nang hiwalay (bawat ~3 segundo) — hindi ito hinihintay ang oras ng whale. Ang timestamp at print ng whale ay frozen sa mismong transaksyon.

Walang Telegram, Discord, o ibang messaging bot. Ikaw lang ang makakakita ng alerts.

## Saan mag-BUY at mag-SELL

Oo — ang direction ay base sa **pinasok vs nilabas** na pera:

| Galaw | Ano ang nangyari | Signal |
| --- | --- | --- |
| **Wallet → Exchange** | Pera **PAPASOK** sa exchange (inflow / pinasok para ibenta) | **MAG-SELL / SHORT** + resistance |
| **Exchange → Wallet** | Pera **PALABAS** ng exchange (outflow / nilabas para i-hold) | **MAG-BUY / ACCUMULATE** + support |
| Exchange internal / unlabeled | Hindi malinaw | **WATCH** — walang entry/exit |

## Live price vs whale print

- **ENTRY / EXIT / STOP** sa trade ticket = **live BTC** ngayon. Ito ang nire-refresh bago gumalaw ang oras ng whale.
- **Whale price level** (amber box) = frozen print nung pumasok/lumabas ang coins. Hindi ito nagiging live price.
- Kung magkalayo ang live at ang lumang print (hal. Aug 10 @ $64,935 vs live ~$76k), may stale warning. Hindi take-profit ang $6,493 sa $65k na short — iyon bug; ang EXIT ngayon ay **90% ng 3R** mula entry→stop, hindi 90% ng presyo ng Bitcoin.

## Ano ang ginagawa nito

1. **Data ingestion** — live mempool websocket + polling sa Mempool.space. Tinututukan ang transaksyong **≥ 500 BTC**, kasama ang timestamp at from/to addresses.
2. **Live price** — `GET /api/price` (Binance `BTCUSDT`, fallback Binance.US, tapos Mempool.space). Hindi naghihintay ng mempool scan.
3. **Whale print** — kung lumang transaksyon, 1-minute kline sa mismong oras. Frozen sa card.
4. **Signal logic** — inflow = SELL, outflow = BUY, gaya ng table sa itaas.
5. **Display** — local web desk at optional terminal log. May **English / Tagalog** toggle sa itaas ng dashboard.
6. **Production fetch** — lahat ng server fetch ay absolute URL. Ang Mempool calls ay `https://mempool.space/api/...`. Relative paths ay sine-resolve gamit ang `NEXT_PUBLIC_VERCEL_URL` / `VERCEL_URL` para hindi mag-fail sa Vercel (`Failed to parse URL from /mempool/recent`).

```
🚨 BTC WHALE ALERT 🚨
Oras (Timestamp): ...
Dami at Galaw: ... BTC · Wallet to Exchange / Exchange to Wallet
Price Level: $...
Signal Recommendation: BUY o SELL
```

## Patakbuhin

Kailangan: Node.js 20+

```bash
npm install
npm run dev
```

Buksan ang dashboard sa [http://127.0.0.1:43127](http://127.0.0.1:43127).

### Sa smartphone

Ang `127.0.0.1` at Cursor preview URL (`*.agent.cvm.dev`) ay hindi magbubukas sa phone. I-deploy sa Vercel (Publish sa Cursor) para makakuha ng `https://…vercel.app` link, tapos i-bookmark o Add to Home Screen.

Terminal-only monitor (parehong engine, naka-print sa console):

```bash
npm run monitor
```

Production build:

```bash
npm run build
npm start
```

## Config

Optional env vars (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `WHALE_THRESHOLD_BTC` | `500` | Minimum BTC para maging whale alert |
| `MEMPOOL_API_BASE` | `https://mempool.space/api` | Esplora API |
| `MEMPOOL_WS_URL` | `wss://mempool.space/api/v1/ws` | Live mempool feed |
| `NEXT_PUBLIC_VERCEL_URL` | (Vercel auto) | App origin; ginagamit para gawing absolute ang relative fetch URLs |

Walang API key ang kailangan.

## Paalala

- 500 BTC na galaw ay bihira. Ang dashboard ay maghihintay nang tahimik hanggang may dumating; may live tape para sa mas maliliit na prints.
- Ang exchange labels ay best-effort mula sa public cluster addresses. Unknown destination = wallet / cold storage.
- Hindi ito financial advice. On-chain flow ay isa lang sa mga input sa trading.
