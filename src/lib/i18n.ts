export type Language = "en" | "fil";

export const LANGUAGE_STORAGE_KEY = "btc-whale-lang";

export const dictionaries = {
  en: {
    htmlLang: "en",
    eyebrow: "BTC/USD · M1 whale desk",
    title: "Whale Signal Desk",
    subtitle:
      "Strict 1-minute chart. Mempool.space on-chain flows plus live Binance, Coinbase, and Kraken order books. A signal fires only when a >500 BTC exchange flow meets a >500 BTC wall, CVD agrees, and the wall survives a 5-second anti-spoof check.",
    livePrice: "Live BTC/USD",
    liveTick: "Live tick",
    priceRefreshing: "Refreshing live price…",
    liveVwap: "Global VWAP",
    liveCvd: "M1 CVD",
    onchainIn: "On-chain inflow",
    onchainOut: "On-chain outflow",
    m1Signal: "M1 confluence",
    timeframe: "Timeframe",
    m1Label: "1-minute (M1)",
    positionSizer: "Position sizing · $1,000 wallet · 1% max risk",
    sizeBtc: "SIZE",
    notional: "Notional",
    riskUsd: "Risk (1%)",
    rrLabel: "1:3 R:R",
    entryVwap: "ENTRY · Global VWAP",
    exitRr: "TAKE PROFIT · 1:3",
    stopWall: "STOP · other side of wall",
    venues: "Public venues (no API keys)",
    armed: "ARMED",
    waiting: "WAITING",
    soundReady: "Alerts armed (click once if the ping is silent)",
    emailIdle: "Email: one alert per M1 candle",
    emailSent: "Email sent to {to}",
    emailSkipped: "Email skipped — set EMAIL_APP_PASSWORD in .env",
    emailFailed: "Email failed: {detail}",
    sellHint: "Inflow >500 BTC + ask wall + selling CVD",
    buyHint: "Outflow >500 BTC + bid wall + buying CVD",
    waitHint: "Need flow, wall touch, CVD, and a real wall",
    chartTitle: "M1 chart · whale levels",
    chartHint:
      "Solid boxes are >500 BTC whale walls. Dashed boxes are notable ≥80 BTC clusters so you can see where size sits. Yellow = VWAP. White = live price.",
    wallsTitle: "Where whales placed levels",
    wallsEmpty: "No ≥80 BTC clustered walls on the visible book right now.",
    flowTitle: "On-chain whale tape",
    flowEmpty: "No labeled ≥50 BTC exchange flow in the last hour.",
    spoofOk: "Anti-spoof passed (wall still there after 5s)",
    spoofFail: "Anti-spoof rejected a vanishing wall",
    spoofIdle: "5-second spoof check runs only when confluence is armed",
    lastScan: "Last scan",
    pending: "pending",
    uiRefresh: "UI refresh",
    rescan: "Scan again",
    feedError: "Data feed problem: {error}. Retrying.",
    fetchError: "Could not load signals",
    connectingLiveFeed: "Connecting public books",
    buyNow: "MAG-BUY at {entry}",
    sellNow: "MAG-SELL at {entry}",
    buyPlan:
      "MAG-BUY at live Global VWAP {entry}. Stop is the other side of the bid wall at {stop}. Take profit (1:3) at {exit}.",
    sellPlan:
      "MAG-SELL at live Global VWAP {entry}. Stop is the other side of the ask wall at {stop}. Take profit (1:3) at {exit}.",
    watchNotTrade:
      "M1 confluence is waiting. No trade from a stale print or a spoofed wall.",
    profitNote:
      "Risk is $10 (1% of a $1,000 wallet). Stop sits on the far side of the whale wall. Target is 3× that distance. Not financial advice.",
    exchangeLevels: "Exchange Levels (Binance/Coinbase Data)",
    puPrimeLevels: "PuPrime Levels (MT4/MT5 Guide)",
    puPrimeLive: "PU Prime guide",
    puPrimeGapHint: "−$130 gap vs exchange · $17 spread",
    puPrimeWait:
      "When a signal fires, this box splits into exchange levels for the bot and PU Prime MT4/MT5 levels (−$130 gap, $17 spread, size in lots, $10 max risk).",
    sizeLots: "VOLUME · Lots",
    lotsGuide: "Use {lots} Lots",
    howToRead: "How to read this",
    inflowExplain:
      "SELL only: on-chain inflow >500 BTC into an exchange AND price tags a >500 BTC ask wall AND CVD is selling.",
    outflowExplain:
      "BUY only: on-chain outflow >500 BTC off an exchange AND price leans on a >500 BTC bid wall AND CVD is buying.",
    spoofExplain:
      "Inside the current M1 candle the desk waits 5 seconds and re-reads the book. If the wall shrinks or disappears, it was spoofing — no email, no ping.",
    puPrimeExplain:
      "PU Prime prints about $130 below Binance/Coinbase, with a $17 spread. Exchange levels stay on bot data. The MT4/MT5 guide subtracts $130, pads the stop for spread, keeps $10 max risk, and sizes in lots.",
    inflow: "Inflow",
    outflow: "Outflow",
    language: "Language",
    english: "English",
    tagalog: "Tagalog",
    whaleWall: "Whale wall",
    notableWall: "Notable wall",
    bids: "Bids",
    asks: "Asks",
    candle: "M1 candle",
  },
  fil: {
    htmlLang: "fil",
    eyebrow: "BTC/USD · M1 whale desk",
    title: "Whale Signal Desk",
    subtitle:
      "Mahigpit sa 1-minutong chart. On-chain flow mula sa Mempool.space plus live order book ng Binance, Coinbase, at Kraken. Magfa-fire lang ang signal kung magtatagpo ang >500 BTC exchange flow, >500 BTC na pader, sumasang-ayon ang CVD, at buhay pa ang pader pagkatapos ng 5-segundong anti-spoof.",
    livePrice: "Live BTC/USD",
    liveTick: "Live tick",
    priceRefreshing: "Nina-refresh ang live price…",
    liveVwap: "Global VWAP",
    liveCvd: "M1 CVD",
    onchainIn: "On-chain inflow",
    onchainOut: "On-chain outflow",
    m1Signal: "M1 confluence",
    timeframe: "Timeframe",
    m1Label: "1-minuto (M1)",
    positionSizer: "Position sizing · $1,000 wallet · 1% max risk",
    sizeBtc: "SIZE",
    notional: "Notional",
    riskUsd: "Risk (1%)",
    rrLabel: "1:3 R:R",
    entryVwap: "ENTRY · Global VWAP",
    exitRr: "TAKE PROFIT · 1:3",
    stopWall: "STOP · kabilang panig ng pader",
    venues: "Public venues (walang API keys)",
    armed: "ARMED",
    waiting: "WAITING",
    soundReady: "Alerts armed (i-click once kung walang tunog)",
    emailIdle: "Email: isang alert bawat M1 candle",
    emailSent: "Naipadala ang email sa {to}",
    emailSkipped: "Hindi na-send ang email — ilagay ang EMAIL_APP_PASSWORD sa .env",
    emailFailed: "Email failed: {detail}",
    sellHint: "Inflow >500 BTC + ask wall + selling CVD",
    buyHint: "Outflow >500 BTC + bid wall + buying CVD",
    waitHint: "Kailangan ng flow, wall touch, CVD, at totoong pader",
    chartTitle: "M1 chart · whale levels",
    chartHint:
      "Solid boxes = >500 BTC whale walls. Dashed = notable ≥80 BTC clusters para makita kung saan naka-pwesto ang laki. Dilaw = VWAP. Puti = live price.",
    wallsTitle: "Saan nilagay ng whale ang levels",
    wallsEmpty: "Walang ≥80 BTC clustered wall sa nakikitang book ngayon.",
    flowTitle: "On-chain whale tape",
    flowEmpty: "Walang labeled ≥50 BTC exchange flow sa nakaraang oras.",
    spoofOk: "Anti-spoof passed (nandiyan pa ang pader after 5s)",
    spoofFail: "Anti-spoof: biglang nawala ang pader",
    spoofIdle: "Tumatakbo ang 5-segundong spoof check kapag may confluence",
    lastScan: "Last scan",
    pending: "pending",
    uiRefresh: "UI refresh",
    rescan: "I-scan ulit",
    feedError: "May problema sa data feed: {error}. Patuloy ang retry.",
    fetchError: "Hindi makuha ang signals",
    connectingLiveFeed: "Kumukonekta sa public books",
    buyNow: "MAG-BUY sa {entry}",
    sellNow: "MAG-SELL sa {entry}",
    buyPlan:
      "MAG-BUY sa live Global VWAP {entry}. Stop ay kabilang panig ng bid wall sa {stop}. Take profit (1:3) sa {exit}.",
    sellPlan:
      "MAG-SELL sa live Global VWAP {entry}. Stop ay kabilang panig ng ask wall sa {stop}. Take profit (1:3) sa {exit}.",
    watchNotTrade:
      "Naghihintay ang M1 confluence. Walang trade mula sa lumang print o pekeng pader.",
    profitNote:
      "$10 ang risk (1% ng $1,000 wallet). Stop ay sa kabilang panig ng whale wall. Target ay 3× nun. Hindi financial advice.",
    exchangeLevels: "Exchange Levels (Binance/Coinbase Data)",
    puPrimeLevels: "PuPrime Levels (MT4/MT5 Guide)",
    puPrimeLive: "PU Prime guide",
    puPrimeGapHint: "−$130 gap vs exchange · $17 spread",
    puPrimeWait:
      "Kapag mag-fire ang signal, maghihiwalay ang box: exchange levels para sa bot, at PU Prime MT4/MT5 levels (−$130 gap, $17 spread, size sa lots, $10 max risk).",
    sizeLots: "VOLUME · Lots",
    lotsGuide: "Use {lots} Lots",
    howToRead: "Paano binabasa",
    inflowExplain:
      "SELL lang: on-chain inflow >500 BTC papuntang exchange AT tumama ang presyo sa >500 BTC ask wall AT selling ang CVD.",
    outflowExplain:
      "BUY lang: on-chain outflow >500 BTC palabas ng exchange AT sumandal ang presyo sa >500 BTC bid wall AT buying ang CVD.",
    spoofExplain:
      "Sa loob ng kasalukuyang M1 candle, maghihintay ng 5 segundo at babasahin ulit ang book. Kung lumiit o nawala ang pader, spoofing iyon — walang email, walang ping.",
    puPrimeExplain:
      "Mga $130 ang baba ng PU Prime vs Binance/Coinbase, plus $17 spread. Exchange levels ang bot. Ang MT4/MT5 guide ay minus $130, pad ng spread sa stop, $10 max risk, at lots ang size.",
    inflow: "Inflow",
    outflow: "Outflow",
    language: "Wika",
    english: "English",
    tagalog: "Tagalog",
    whaleWall: "Whale wall",
    notableWall: "Notable wall",
    bids: "Bids",
    asks: "Asks",
    candle: "M1 candle",
  },
} as const;

export type Dictionary = (typeof dictionaries)[Language];

export function interpolate(
  template: string,
  vars: Record<string, string | number>
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(vars[key] ?? "")
  );
}
