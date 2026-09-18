# Whale Signal Desk

Local BTC/USD whale tracker. Binabasa nito ang malalaking Bitcoin transaksyon mula sa [Mempool.space](https://mempool.space), kinukuha ang eksaktong BTC price sa oras ng galaw (Binance, with fallbacks), at naglalabas ng BUY/SELL signal sa isang local dashboard.

Walang Telegram, Discord, o ibang messaging bot. Ikaw lang ang makakakita ng alerts.

## Ano ang ginagawa nito

1. **Data ingestion** — live mempool websocket + polling sa Mempool.space. Tinututukan ang transaksyong **≥ 500 BTC**, kasama ang timestamp at from/to addresses.
2. **Price level** — Binance `BTCUSDT` (fallback: Binance.US, tapos Mempool.space prices). Kung lumang transaksyon, 1-minute kline sa mismong oras.
3. **Signal logic**
   - Inflow papuntang exchange → `SELL / SHORT SETUP` + tinatayang resistance
   - Outflow palabas ng exchange papuntang wallet → `BUY / ACCUMULATION` + tinatayang support
4. **Display** — local web desk at optional terminal log. May **English / Tagalog** toggle sa itaas ng dashboard.
5. **Production fetch** — lahat ng server fetch ay absolute URL. Ang Mempool calls ay `https://mempool.space/api/...`. Relative paths ay sine-resolve gamit ang `NEXT_PUBLIC_VERCEL_URL` / `VERCEL_URL` para hindi mag-fail sa Vercel (`Failed to parse URL from /mempool/recent`).

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
