export type MovementKind =
  | "Wallet to Exchange"
  | "Exchange to Wallet"
  | "Exchange Internal"
  | "Wallet to Wallet";

export type SignalSide = "BUY" | "SELL" | "WATCH";

export type AddressKind = "exchange" | "wallet";

export type LabeledAddress = {
  address: string;
  label: string;
  entity: string | null;
  kind: AddressKind;
  btc: number;
};

export type SignalNoteKey = "inflow" | "outflow" | "internal" | "unlabeled";

export type KeyLevel = {
  kind: "resistance" | "support" | "none";
  price: number;
  zoneLow: number;
  zoneHigh: number;
  noteKey: SignalNoteKey;
  note: string;
};

export type WhaleSignal = {
  id: string;
  txid: string;
  timestamp: string;
  timestampUnix: number;
  btcAmount: number;
  movement: MovementKind;
  from: LabeledAddress[];
  to: LabeledAddress[];
  primaryFrom: LabeledAddress;
  primaryTo: LabeledAddress;
  priceUsd: number;
  priceSource: string;
  signal: SignalSide;
  recommendation: string;
  keyLevel: KeyLevel;
  confirmed: boolean;
  blockHeight: number | null;
  explorerUrl: string;
  seenIn: "mempool" | "address-watch" | "block";
};

export type VenueTick = {
  name: string;
  symbol: string;
  last: number;
  ok: boolean;
  timestamp: string;
};

export type LivePrice = {
  usd: number;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  source: string;
  timestamp: string;
  venues?: VenueTick[];
};

export type TapePrint = {
  txid: string;
  btc: number;
  timestampUnix: number;
  confirmed: boolean;
};

export type EngineSnapshot = {
  ok: boolean;
  error: string | null;
  price: LivePrice | null;
  thresholdBtc: number;
  lastScanAt: string | null;
  scanning: boolean;
  liveFeed: boolean;
  trackedWallets: number;
  stats: {
    buy: number;
    sell: number;
    watch: number;
    total: number;
  };
  signals: WhaleSignal[];
  tape: TapePrint[];
};

export type MempoolTxPreview = {
  txid: string;
  value: number;
  fee?: number;
  vsize?: number;
  time?: number;
};

export type EsploraPrevout = {
  scriptpubkey_address?: string;
  value: number;
};

export type EsploraVin = {
  txid?: string;
  prevout?: EsploraPrevout | null;
  is_coinbase?: boolean;
};

export type EsploraVout = {
  scriptpubkey_address?: string;
  value: number;
};

export type EsploraTx = {
  txid: string;
  fee?: number;
  weight?: number;
  size?: number;
  vin: EsploraVin[];
  vout: EsploraVout[];
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
};
