export type Language = "en" | "fil";

export const LANGUAGE_STORAGE_KEY = "btc-whale-lang";

export const dictionaries = {
  en: {
    htmlLang: "en",
    eyebrow: "BTC/USD desk",
    title: "Whale Signal Desk",
    subtitle:
      "Real-time 500+ BTC on-chain moves from Mempool.space, with the price at the exact time of the transfer, plus a BUY/SELL recommendation. Only you can see this — no Telegram or Discord.",
    livePrice: "Live BTC/USD",
    whaleThreshold: "Whale threshold",
    whaleThresholdHint: "Watching transfers above {threshold} BTC",
    sellShort: "SELL / SHORT",
    sellHint: "Inflow to an exchange",
    buyAccum: "BUY / ACCUMULATION",
    buyHint: "Outflow from an exchange",
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
    entry: "ENTRY",
    exit: "EXIT · 90% TP",
    stopLoss: "STOP",
    tradeWhen: "When",
    tradeAt: "Price level",
    profitTarget: "90% profit target",
    buyPlan:
      "BUY: enter at {entry}. Take profit (90%) at {exit}. Invalid if price breaks {stop}.",
    sellPlan:
      "SELL: enter at {entry}. Take profit (90%) at {exit}. Invalid if price breaks {stop}.",
    watchNotTrade:
      "This is NOT a buy/sell. Binance-to-Binance (or unlabeled) flow has no entry/exit. Open the BUY or SELL tab for trade levels.",
    profitNote:
      "90% is a target, not a guarantee. Manage size. Not financial advice.",
    emptyTitle: "No {threshold}+ BTC whale move right now",
    emptyBody:
      "{threshold} BTC transfers are rare. The mempool and known exchange wallets are being monitored. Alerts appear here with the exact price level when one lands.",
    liveTape: "Live tape",
    liveTapeHint:
      "Largest transfers in the latest scan — not an automatic BUY/SELL until they reach the threshold.",
    waitingTape: "Waiting for mempool prints…",
    howToRead: "How to read this",
    inflowExplain:
      "Inflow to an exchange → SELL. They placed resistance at that price; it may stop up to the high of the zone.",
    outflowExplain:
      "Outflow from an exchange to a wallet → BUY. They placed support at that price; it may hold down to the low of the zone.",
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
      "Real-time na 500+ BTC on-chain galaw mula sa Mempool.space, may presyo sa mismong oras ng transaksyon, at BUY/SELL recommendation. Ikaw lang ang makakakita nito — walang Telegram o Discord.",
    livePrice: "Live BTC/USD",
    whaleThreshold: "Whale threshold",
    whaleThresholdHint: "Binabantayan ang transaksyong higit sa {threshold} BTC",
    sellShort: "SELL / SHORT",
    sellHint: "Inflow papuntang exchange",
    buyAccum: "BUY / ACCUMULATION",
    buyHint: "Outflow palabas ng exchange",
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
    entry: "ENTRY",
    exit: "EXIT · 90% TP",
    stopLoss: "STOP",
    tradeWhen: "Kailan",
    tradeAt: "Price level",
    profitTarget: "90% profit target",
    buyPlan:
      "BUY: pumasok sa {entry}. Take profit (90%) sa {exit}. Invalid kung bumaba ng {stop}.",
    sellPlan:
      "SELL: pumasok sa {entry}. Take profit (90%) sa {exit}. Invalid kung tumaas ng {stop}.",
    watchNotTrade:
      "HINDI ito buy/sell. Internal exchange transfer — walang entry/exit. Pindutin ang BUY o SELL tab para sa trade levels.",
    profitNote:
      "Target ang 90%, hindi guaranteed. Ikaw ang may risk. Hindi financial advice.",
    emptyTitle: "Walang {threshold}+ BTC whale move sa ngayon",
    emptyBody:
      "Bihira ang {threshold} BTC na galaw. Naka-monitor ang mempool at mga kilalang exchange wallets. Lalabas dito ang alert kapag may dumating, kasama ang exact price level.",
    liveTape: "Live tape",
    liveTapeHint:
      "Pinakamalalaking nakitang transaksyon sa latest scan — hindi ito automatic na BUY/SELL hangga't hindi umabot sa threshold.",
    waitingTape: "Naghihintay ng mempool prints…",
    howToRead: "Paano binabasa",
    inflowExplain:
      "Inflow papuntang exchange → SELL. Doon nila nilagay ang resistance; hihinto (posible) hanggang sa taas ng zone.",
    outflowExplain:
      "Outflow palabas ng exchange papuntang wallet → BUY. Doon nila nilagay ang support; hihinto (posible) hanggang sa baba ng zone.",
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
