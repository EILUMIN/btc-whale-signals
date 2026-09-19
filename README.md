# Whale Signal Desk

Public **BTC-flow monitor** on a **strict 1-minute (M1)** chart. Free sources only: **Mempool.space** (with **Blockstream Esplora** fallback) plus live **CCXT** books from Binance, Coinbase, and Kraken. Walang private API keys. Canada-safe: Binance.com → Binance.US.

The desk watches **every labeled exchange cluster** in this repo (Binance, Coinbase, Kraken, Bitfinex, OKX, BitMEX, HTX, Bitstamp, Bittrex). Unlabeled wallet-to-wallet size is shown separately. Pending mempool txs include confirmations and a fee-based ETA.

`DISCORD_WEBHOOK_URL` and Gmail SMTP live in **server-side `.env` only** (never `NEXT_PUBLIC_`). To send a WATCH test through the same one-alert-per-M1-candle latch:

```bash
npm run test:watch-alert
```

Walang RSI. Walang ATR. Ang orihinal na whale system: **on-chain flow + order-book walls**.

## M1 confluence

| Side | Fire only when all of these are true |
| --- | --- |
| **SELL** | Labeled on-chain **inflow >500 BTC** into an exchange **and** price tags a **>500 BTC ask wall** **and** M1 **CVD is selling** **and** the wall is still there after **5 seconds** |
| **BUY** | Labeled on-chain **outflow >500 BTC** off an exchange **and** price leans on a **>500 BTC bid wall** **and** M1 **CVD is buying** **and** the wall survives the same 5-second anti-spoof check |

Unlabeled prints never count toward the 500 BTC trigger. The tape floor is **≥10 BTC** so you can still see size moving.

The dashboard draws those walls as price-level boxes on the M1 chart (solid = whale >500 BTC, dashed = notable ≥80 BTC so you can still see size). Signals never fire on the dashed boxes.

Risk math (auto-updates from live Global VWAP at the confluence second):

- **Exchange Levels (Binance/Coinbase Data)** — bot monitoring. ENTRY = Global VWAP. STOP = other side of the whale wall. TAKE PROFIT = 1:3. Size in BTC. **$10** max risk on a **$1,000** wallet.
- **PuPrime Levels (MT4/MT5 Guide)** — subtract **$130** so PU Prime matches the exchange screen, pad the stop by the **$17** spread, keep **$10** max risk, and print volume as **lots** (e.g. `Use 0.04 Lots`).

```bash
npm install
cp .env.example .env
npm run dev
```

Dashboard: [http://127.0.0.1:43127](http://127.0.0.1:43127)

## Python twin (`master_bot.py`)

```bash
pip install -r requirements-bot.txt
python3 master_bot.py
python3 master_bot.py --once
```

Same M1 rules, same $10 / 1:3 math, same one-alert-per-candle latch (email + Discord).

Hindi ito financial advice.

## Email, Discord, and sound alerts

Kapag mag-fire ang BUY o SELL sa M1 confluence:

1. May **browser ping** sa dashboard.
2. **Isang email** at **isang Discord post** lang bawat 1-minute candle. Title:

`[HIGH-CONFIDENCE CONFLUENCE] M1 Whale Signal Alert`

Gmail SMTP `smtp.gmail.com:587` + TLS. Discord uses an incoming webhook. Ilagay sa `.env`:

```
EMAIL_SENDER=elmer.whaledesk@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_RECEIVER=elmer.whaledesk@gmail.com
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-id/your-token
```

Gumawa ng [Gmail App Password](https://myaccount.google.com/apppasswords) (2FA on). Huwag ordinaryong password. Kung walang `EMAIL_APP_PASSWORD` o `DISCORD_WEBHOOK_URL`, tumutunog pa rin ang desk; skip lang ang missing channel.

### Public on-chain sources

| Source | Role |
| --- | --- |
| `https://mempool.space/api` | Primary Esplora (mempool, blocks, address txs, fees) |
| `https://blockstream.info/api` | Automatic fallback if Mempool.space is down |
| Binance / Coinbase / Kraken | Public order books and M1 candles (no keys) |

Override with `MEMPOOL_API_BASE` / `BLOCKSTREAM_API_BASE` if you run a local Esplora.

### Sa smartphone

I-deploy sa Vercel (Publish) para sa `https://…vercel.app`. Walang kailangang API key. Optional: set `EMAIL_APP_PASSWORD` and `DISCORD_WEBHOOK_URL` in Vercel env.

Production:

```bash
npm run build
npm start
```
