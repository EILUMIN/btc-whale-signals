# Whale Signal Desk

BTC/USD desk on a **strict 1-minute (M1)** chart. Public **CCXT** books from Binance, Coinbase, and Kraken plus **Mempool.space** on-chain flows. Walang private API keys. Canada-safe: Binance.com → Binance.US.

Walang RSI. Walang ATR. Ang orihinal na whale system: **on-chain flow + order-book walls**.

## M1 confluence

| Side | Fire only when all of these are true |
| --- | --- |
| **SELL** | On-chain **inflow >500 BTC** into an exchange **and** price tags a **>500 BTC ask wall** **and** M1 **CVD is selling** **and** the wall is still there after **5 seconds** |
| **BUY** | On-chain **outflow >500 BTC** off an exchange **and** price leans on a **>500 BTC bid wall** **and** M1 **CVD is buying** **and** the wall survives the same 5-second anti-spoof check |

The dashboard draws those walls as price-level boxes on the M1 chart (solid = whale >500 BTC, dashed = notable ≥80 BTC so you can still see size). Signals never fire on the dashed boxes.

Risk math (auto-updates from live Global VWAP at the confluence second):

- **Exchange Levels (Binance/Coinbase Data)** — bot monitoring. ENTRY = Global VWAP. STOP = other side of the whale wall. TAKE PROFIT = 1:3. Size in BTC. **$10** max risk on a **$1,000** wallet.
- **PuPrime Levels (MT4/MT5 Guide)** — subtract **$130** so PU Prime matches the exchange screen, pad the stop by the **$17** spread, keep **$10** max risk, and print volume as **lots** (e.g. `Use 0.04 Lots`).

```bash
npm install
npm run dev
```

Dashboard: [http://127.0.0.1:43127](http://127.0.0.1:43127)

## Python twin (`master_bot.py`)

```bash
pip install -r requirements-bot.txt
python3 master_bot.py
python3 master_bot.py --once
```

Same M1 rules, same $10 / 1:3 math, same one-email-per-candle latch.

Hindi ito financial advice.

## Email + sound alerts

Kapag mag-fire ang BUY o SELL sa M1 confluence:

1. May **browser ping** sa dashboard.
2. **Isang email lang** bawat 1-minute candle papunta sa `elmer.whaledesk@gmail.com`. Title:

`[HIGH-CONFIDENCE CONFLUENCE] M1 Whale Signal Alert`

Gmail SMTP `smtp.gmail.com:587` + TLS. Ilagay sa `.env`:

```
EMAIL_SENDER=elmer.whaledesk@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_RECEIVER=elmer.whaledesk@gmail.com
```

Gumawa ng [Gmail App Password](https://myaccount.google.com/apppasswords) (2FA on). Huwag ordinaryong password. Kung walang `EMAIL_APP_PASSWORD`, tumutunog pa rin ang desk; skip lang ang SMTP.

### Sa smartphone

I-deploy sa Vercel (Publish) para sa `https://…vercel.app`. Walang kailangang API key.

Production:

```bash
npm run build
npm start
```
