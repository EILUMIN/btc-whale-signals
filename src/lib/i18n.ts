export type Language = "en" | "fil";

export const LANGUAGE_STORAGE_KEY = "btc-whale-lang";

export const dictionaries = {
  en: {
    htmlLang: "en",
    eyebrow: "BTC/USD desk",
    title: "Whale Signal Desk",
    subtitle:
      "Multi-exchange desk: Binance + Coinbase + Kraken via public CCXT. Live RSI(14) and ATR(14) drive the generator. ATR > 150 and RSI > 75 locks all signals. Take-profit is 1:3 from live Global VWAP — never a stale $64k wall.",
    livePrice: "Live BTC/USD",
    liveTick: "Live tick",
    priceRefreshing: "Refreshing live price…",
    liveRsi: "live_rsi",
    liveAtr: "live_atr",
    liveVwap: "Global VWAP",
    breakoutHold: "BREAKOUT DETECTED - HOLDING SIGNALS",
    breakoutHint:
      "ATR is above 150 and RSI is above 75. The generator is locked so we do not fade the $80k melt-up.",
    waitingExhaustion:
      "Waiting for RSI exhaustion: must rise into overbought then cross back below 70.",
    positionSizer: "Position sizing · $1,000 wallet · 1% max risk",
    sizeBtc: "SIZE",
    notional: "Notional",
    riskUsd: "Risk (1%)",
    rrLabel: "1:3 R:R",
    entryVwap: "ENTRY · Global VWAP",
    exitRr: "TAKE PROFIT · 1:3",
    stopAtr: "STOP · 1.5× ATR",
    venues: "Public venues (no API keys)",
    matrixSignal: "Matrix signal",
    armed: "ARMED",
    holding: "HOLDING",
    waiting: "WAITING",
    sellHint: "RSI exhaustion drop below 70",
    buyHint: "RSI lift from oversold (<30)",
    exchangeWallets: "Exchange wallets",
    liveWebsocket: "Live mempool websocket",
    pollingMempool: "Polling mempool",
    liveFeedConnected: "Live feed connected",
    connectingLiveFeed: "Connecting live feed",
    lastScan: "Last scan",
    pending: "pending",
    uiRefresh: "UI refresh",
    rescan: "Scan again",
    feedError: "Data feed problem: {error}. Retrying.",
    fetchError: "Could not load signals",
    whaleAlerts: "Whale alerts",
    tabAll: "Trades",
    tabWatch: "WATCH",
    entry: "ENTRY · Global VWAP",
    exit: "TAKE PROFIT · 1:3",
    stopLoss: "STOP · 1.5× ATR",
    tradeWhen: "Armed when",
    tradeAt: "Invalid if live price breaks this",
    profitTarget: "Take profit · 1:3 from VWAP",
    rLabel: "1:3 R:R · risk ${risk}",
    buyNow: "MAG-BUY at {entry}",
    sellNow: "MAG-SELL at {entry}",
    buyPlan:
      "MAG-BUY at live Global VWAP {entry}. Take profit (1:3) at {exit}. Stop is 1.5× ATR at {stop}.",
    sellPlan:
      "MAG-SELL at live Global VWAP {entry}. Take profit (1:3) at {exit}. Stop is 1.5× ATR at {stop}.",
    watchNotTrade:
      "Generator is waiting or locked. No trade from a stale whale wall.",
    profitNote:
      "Risk is 1% of a $1,000 wallet. Stop is 1.5× ATR from VWAP. Target is 3× that distance. Not financial advice.",
    stalePrint:
      "This whale printed at {whale} on {when}. That frozen print is not live BTC. Entry and exit use the live price, which refreshes on its own before the whale clock moves.",
    whalePrint: "Whale print (frozen)",
    moneyInTitle: "Money IN to an exchange",
    moneyInBody:
      "Wallet → Exchange. BTC was deposited (pinasok) onto an exchange. That is selling pressure → MAG-SELL / SHORT.",
    moneyOutTitle: "Money OUT of an exchange",
    moneyOutBody:
      "Exchange → Wallet. BTC was withdrawn (nilabas) off an exchange. That is accumulation → MAG-BUY.",
    emptyTitle: "No {threshold}+ BTC whale move right now",
    emptyBody:
      "{threshold} BTC transfers are rare. The mempool and known exchange wallets are being monitored. Alerts appear here with the exact price level when one lands.",
    liveTape: "Live tape",
    liveTapeHint:
      "Largest transfers in the latest scan — not an automatic BUY/SELL until they reach the threshold.",
    waitingTape: "Waiting for mempool prints…",
    howToRead: "How to read this",
    inflowExplain:
      "Pera PAPASOK sa exchange (wallet → exchange) → MAG-SELL. Resistance at the print; it may stall up to the high of the zone.",
    outflowExplain:
      "Pera PALABAS ng exchange (exchange → wallet) → MAG-BUY. Support at the print; it may hold down to the low of the zone.",
    inflow: "Inflow",
    outflow: "Outflow",
    timestamp: "Time (Timestamp)",
    sizeAndMove: "Size and movement",
    priceLevel: "Price Level",
    signalRecommendation: "Signal Recommendation",
    estimatedResistance: "Estimated Resistance",
    estimatedSupport: "Estimated Support",
    keyLevel: "Key Level",
    zone: "zone",
    levelMap: "Whale price level",
    placedWhen: "When they placed it",
    placedAt: "Level they placed",
    stopsAt: "Where it may stop",
    resistanceStops:
      "Resistance from {placed} up to {stop}. Price may stall or reverse near {stop}.",
    supportStops:
      "Support from {placed} down to {stop}. Price may stall or bounce near {stop}.",
    watchNoStop:
      "No buy/sell stop level — destination is not a clear exchange flow.",
    from: "From",
    to: "To",
    noAddress: "No address data",
    copyAlert: "Copy alert",
    copied: "Copied",
    confirmed: "Confirmed · block {block}",
    unconfirmed: "Unconfirmed · mempool",
    walletCold: "Wallet / cold storage",
    unknownOutput: "Unknown output",
    language: "Language",
    english: "English",
    tagalog: "Tagalog",
    noteInflow:
      "Inflow (≥ {threshold} BTC) to an exchange — selling pressure is possible around this price.",
    noteOutflow:
      "Outflow (≥ {threshold} BTC) from an exchange to a wallet — accumulation is possible around this price.",
    noteInternal: "Move between exchange wallets — not a directional buy/sell.",
    noteUnlabeled:
      "Large transfer, but the exchange cluster is unidentified. No BUY/SELL until the destination is clear.",
    movementWalletToExchange: "Wallet to Exchange",
    movementExchangeToWallet: "Exchange to Wallet",
    movementExchangeInternal: "Exchange Internal",
    movementWalletToWallet: "Wallet to Wallet",
  },
  fil: {
    htmlLang: "fil",
    eyebrow: "BTC/USD desk",
    title: "Whale Signal Desk",
    subtitle:
      "Multi-exchange desk: Binance + Coinbase + Kraken via public CCXT. Live RSI(14) at ATR(14) ang magpapasya. Kapag ATR > 150 at RSI > 75, naka-lock ang generator. Take-profit ay 1:3 mula sa live Global VWAP — hindi stale na $64k na pader.",
    livePrice: "Live BTC/USD",
    liveTick: "Live tick",
    priceRefreshing: "Nina-refresh ang live price…",
    liveRsi: "live_rsi",
    liveAtr: "live_atr",
    liveVwap: "Global VWAP",
    breakoutHold: "BREAKOUT DETECTED - HOLDING SIGNALS",
    breakoutHint:
      "Lampas 150 ang ATR at lampas 75 ang RSI. Naka-lock ang generator — hindi tayo magfe-fade ng $80k melt-up.",
    waitingExhaustion:
      "Hinihintay ang RSI exhaustion: kailangang umakyat sa overbought, tapos tumawid pabalik sa ilalim ng 70.",
    positionSizer: "Position sizing · $1,000 wallet · 1% max risk",
    sizeBtc: "SIZE",
    notional: "Notional",
    riskUsd: "Risk (1%)",
    rrLabel: "1:3 R:R",
    entryVwap: "ENTRY · Global VWAP",
    exitRr: "TAKE PROFIT · 1:3",
    stopAtr: "STOP · 1.5× ATR",
    venues: "Public venues (walang API keys)",
    matrixSignal: "Matrix signal",
    armed: "ARMED",
    holding: "HOLDING",
    waiting: "WAITING",
    sellHint: "RSI exhaustion drop below 70",
    buyHint: "RSI lift mula oversold (<30)",
    exchangeWallets: "Exchange wallets",
    liveWebsocket: "Live mempool websocket",
    pollingMempool: "Polling mempool",
    liveFeedConnected: "Live feed connected",
    connectingLiveFeed: "Connecting live feed",
    lastScan: "Last scan",
    pending: "pending",
    uiRefresh: "UI refresh",
    rescan: "I-scan ulit",
    feedError: "May problema sa data feed: {error}. Patuloy ang retry.",
    fetchError: "Hindi makuha ang signals",
    whaleAlerts: "Whale alerts",
    tabAll: "Trades",
    tabWatch: "WATCH",
    entry: "ENTRY · Global VWAP",
    exit: "TAKE PROFIT · 1:3",
    stopLoss: "STOP · 1.5× ATR",
    tradeWhen: "Armed noong",
    tradeAt: "Invalid kung masira ng live price",
    profitTarget: "Take profit · 1:3 mula sa VWAP",
    rLabel: "1:3 R:R · risk ${risk}",
    buyNow: "MAG-BUY sa {entry}",
    sellNow: "MAG-SELL sa {entry}",
    buyPlan:
      "MAG-BUY sa live Global VWAP {entry}. Take profit (1:3) sa {exit}. Stop ay 1.5× ATR sa {stop}.",
    sellPlan:
      "MAG-SELL sa live Global VWAP {entry}. Take profit (1:3) sa {exit}. Stop ay 1.5× ATR sa {stop}.",
    watchNotTrade:
      "Naghihintay o naka-lock ang generator. Walang trade mula sa lumang whale wall.",
    profitNote:
      "1% ng $1,000 wallet ang risk. Stop ay 1.5× ATR mula sa VWAP. Target ay 3× nun. Hindi financial advice.",
    stalePrint:
      "Nag-print ang whale sa {whale} noong {when}. Hindi iyon ang live BTC. Ang entry at exit ay base sa live price, na nire-refresh nang hiwalay bago gumalaw ang oras ng whale.",
    whalePrint: "Whale print (hindi nagbabago)",
    moneyInTitle: "Pera PAPASOK sa exchange",
    moneyInBody:
      "Wallet → Exchange. Pinasok nila ang BTC sa exchange. Selling pressure iyon → MAG-SELL / SHORT.",
    moneyOutTitle: "Pera PALABAS ng exchange",
    moneyOutBody:
      "Exchange → Wallet. Nilabas nila ang BTC palabas ng exchange. Accumulation iyon → MAG-BUY.",
    emptyTitle: "Walang {threshold}+ BTC whale move sa ngayon",
    emptyBody:
      "Bihira ang {threshold} BTC na galaw. Naka-monitor ang mempool at mga kilalang exchange wallets. Lalabas dito ang alert kapag may dumating, kasama ang exact price level.",
    liveTape: "Live tape",
    liveTapeHint:
      "Pinakamalalaking nakitang transaksyon sa latest scan — hindi ito automatic na BUY/SELL hangga't hindi umabot sa threshold.",
    waitingTape: "Naghihintay ng mempool prints…",
    howToRead: "Paano binabasa",
    inflowExplain:
      "Pera PAPASOK sa exchange (wallet → exchange) → MAG-SELL. Resistance sa print; hihinto (posible) hanggang sa taas ng zone.",
    outflowExplain:
      "Pera PALABAS ng exchange (exchange → wallet) → MAG-BUY. Support sa print; hihinto (posible) hanggang sa baba ng zone.",
    inflow: "Inflow",
    outflow: "Outflow",
    timestamp: "Oras (Timestamp)",
    sizeAndMove: "Dami at Galaw",
    priceLevel: "Price Level",
    signalRecommendation: "Signal Recommendation",
    estimatedResistance: "Tinatayang Resistance",
    estimatedSupport: "Tinatayang Support",
    keyLevel: "Key Level",
    zone: "zone",
    levelMap: "Price level ng whale",
    placedWhen: "Kailan nila inilagay",
    placedAt: "Saan nila nilagay ang level",
    stopsAt: "Hanggang saan hihinto",
    resistanceStops:
      "Resistance mula {placed} pataas hanggang {stop}. Dito pwedeng tumigil o mag-reverse ang taas.",
    supportStops:
      "Support mula {placed} pababa hanggang {stop}. Dito pwedeng tumigil o mag-bounce ang bagsak.",
    watchNoStop:
      "Walang buy/sell na stop level — hindi malinaw ang galaw papunta/palabas ng exchange.",
    from: "Mula (from)",
    to: "Papunta (to)",
    noAddress: "Walang address data",
    copyAlert: "Copy alert",
    copied: "Copied",
    confirmed: "Confirmed · block {block}",
    unconfirmed: "Unconfirmed · mempool",
    walletCold: "Wallet / cold storage",
    unknownOutput: "Unknown output",
    language: "Wika",
    english: "English",
    tagalog: "Tagalog",
    noteInflow:
      "Inflow (≥ {threshold} BTC) papuntang exchange — posible ang selling pressure sa paligid ng presyong ito.",
    noteOutflow:
      "Outflow (≥ {threshold} BTC) palabas ng exchange papuntang wallet — posible ang accumulation sa paligid ng presyong ito.",
    noteInternal:
      "Galaw sa pagitan ng exchange wallets — hindi directional buy/sell.",
    noteUnlabeled:
      "Malaking transaksyon pero hindi identified ang exchange cluster. Walang BUY/SELL hangga't hindi malinaw ang destination.",
    movementWalletToExchange: "Wallet papuntang Exchange",
    movementExchangeToWallet: "Exchange papuntang Wallet",
    movementExchangeInternal: "Internal sa Exchange",
    movementWalletToWallet: "Wallet papuntang Wallet",
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
