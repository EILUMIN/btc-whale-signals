# Whale Signal Desk

BTC/USD multi-exchange desk. Public **CCXT** pulls Binance, Coinbase, and Kraken together — walang private API keys. Canada-safe: Binance.com → Binance.US fallback.

Hindi na base ang signal sa lumang $64k whale wall o simpleng wallet notification.

## Signal generator

| Condition | Result |
| --- | --- |
| **live_atr > 150** at **live_rsi > 75** | **BREAKOUT DETECTED - HOLDING SIGNALS** |
| RSI tumawid pabalik **below 70** (exhaustion) | **SELL / SHORT** at live Global VWAP |
| RSI umahon mula **<30** | **BUY / LONG** at live Global VWAP |

Risk math (auto-updates from live VWAP):

- **ENTRY** = Global VWAP (tatlong exchange)
- **STOP** = 1.5× ATR
- **TAKE PROFIT** = 1:3 vs stop distance
- **SIZE** = 1% of $1,000 wallet ($10 risk)

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

Parehong lock (RSI>75 + ATR>$150) at 1:3 VWAP math. Terminal dashboard every 10s.

Hindi ito financial advice.

### Sa smartphone

I-deploy sa Vercel (Publish) para sa `https://…vercel.app`. Walang kailangang API key.

Production:

```bash
npm run build
npm start
```
