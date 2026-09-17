/**
 * Publicly labeled Bitcoin exchange cluster addresses.
 * Unknown destinations are treated as wallets (hot or cold).
 *
 * Labels come from public cluster data (BitInfoCharts / community
 * wallet labels) and can drift as exchanges rotate hot wallets.
 */

export type ExchangeWallet = {
  name: string;
  entity: string;
};

export const EXCHANGE_WALLETS: Record<string, ExchangeWallet> = {
  // Binance
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": {
    name: "Binance Cold Wallet",
    entity: "Binance",
  },
  bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97: {
    name: "Binance Hot Wallet",
    entity: "Binance",
  },
  "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6": {
    name: "Binance",
    entity: "Binance",
  },
  bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h: {
    name: "Binance",
    entity: "Binance",
  },
  "1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s": {
    name: "Binance",
    entity: "Binance",
  },
  "3JZq4atUahhuA9rLh7JfTUiCTCoRg3S8oS": {
    name: "Binance",
    entity: "Binance",
  },
  "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": {
    name: "Binance",
    entity: "Binance",
  },
  "1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ": {
    name: "Binance",
    entity: "Binance",
  },
  "385cR5DM96n1HvBDMzLHPYcw89fZAXULJP": {
    name: "Binance",
    entity: "Binance",
  },
  "1LQoWist8KkaUXSPKZHNvEyfrEkPHzSsCd": {
    name: "Binance",
    entity: "Binance",
  },
  "3LQeSjqS5a2sJDfcQpCUEGmCUS9skryALt": {
    name: "Binance",
    entity: "Binance",
  },

  // Coinbase
  "3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS": {
    name: "Coinbase",
    entity: "Coinbase",
  },
  "3Nxwenay9Z8Lc9JBiywTo1sZkyn2nQaaKR": {
    name: "Coinbase",
    entity: "Coinbase",
  },

  // Bitfinex
  "3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r": {
    name: "Bitfinex Cold Storage",
    entity: "Bitfinex",
  },
  "1Kr6QSydW9bFQG1mXiPNNu6WpJGmUa9i1g": {
    name: "Bitfinex Cold Storage",
    entity: "Bitfinex",
  },
  bc1qazcm763858nkj2dj986etajv6wquslv8uxwczt: {
    name: "Bitfinex",
    entity: "Bitfinex",
  },
  "1FfmbHfnpaZjKFvyi1okTjJJusN455paPH": {
    name: "Bitfinex",
    entity: "Bitfinex",
  },

  // OKX
  bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2: {
    name: "OKX",
    entity: "OKX",
  },
  bc1qa5wkgaew2dkv56kfvj49j0av5nml45x9ek9hz6: {
    name: "OKX",
    entity: "OKX",
  },

  // Kraken
  bc1q5shngj24323nsrmxv99st02na6srekfctt30ch: {
    name: "Kraken",
    entity: "Kraken",
  },
  "3FupZp77ySr7jwoLYEJ9mwzJpvoNBXsBnE": {
    name: "Kraken",
    entity: "Kraken",
  },

  // BitMEX
  "3BMEXqGpG4FxBA1KWhRFufXfSTRgzfDBhJ": {
    name: "BitMEX Cold Wallet",
    entity: "BitMEX",
  },
  "3BMEXDR3sAq2xDx2SSivNT6BGUjrF4oGCX": {
    name: "BitMEX",
    entity: "BitMEX",
  },

  // HTX / Huobi
  "1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ": {
    name: "HTX",
    entity: "HTX",
  },

  // Bitstamp
  "1KYiKJEfdJtap9QX2v9BxAdVwzSpoVu4Uo": {
    name: "Bitstamp",
    entity: "Bitstamp",
  },

  // Bittrex (legacy cluster still referenced in public labels)
  "3NNsvp7dfevkKqwkM6ZPZ2huUMPtFP1166": {
    name: "Bittrex",
    entity: "Bittrex",
  },
};

export const TRACKED_EXCHANGE_ADDRESSES = Object.keys(EXCHANGE_WALLETS);

export function lookupExchange(address: string | undefined | null) {
  if (!address) return null;
  return EXCHANGE_WALLETS[address] ?? null;
}

export function isExchangeAddress(address: string | undefined | null) {
  return lookupExchange(address) !== null;
}
