import { lookupExchange } from "@/lib/exchange-addresses";
import { satsToBtc } from "@/lib/mempool";
import type {
  AddressKind,
  EsploraTx,
  LabeledAddress,
  MovementKind,
} from "@/lib/types";

function labelAddress(address: string | undefined, btc: number): LabeledAddress {
  if (!address) {
    return {
      address: "unknown / op_return",
      label: "Unknown output",
      entity: null,
      kind: "wallet",
      btc,
    };
  }
  const exchange = lookupExchange(address);
  if (exchange) {
    return {
      address,
      label: exchange.name,
      entity: exchange.entity,
      kind: "exchange",
      btc,
    };
  }
  return {
    address,
    label: "Wallet / cold storage",
    entity: null,
    kind: "wallet",
    btc,
  };
}

function mergeByAddress(rows: LabeledAddress[]) {
  const map = new Map<string, LabeledAddress>();
  for (const row of rows) {
    const existing = map.get(row.address);
    if (existing) {
      existing.btc += row.btc;
    } else {
      map.set(row.address, { ...row });
    }
  }
  return [...map.values()].sort((a, b) => b.btc - a.btc);
}

export type ClassifiedTx = {
  from: LabeledAddress[];
  to: LabeledAddress[];
  primaryFrom: LabeledAddress;
  primaryTo: LabeledAddress;
  exchangeInBtc: number;
  exchangeOutBtc: number;
  walletInBtc: number;
  walletOutBtc: number;
  movement: MovementKind;
  isCoinbase: boolean;
};

export function classifyTransaction(tx: EsploraTx): ClassifiedTx {
  const isCoinbase =
    tx.vin.some((input) => input.is_coinbase === true) ||
    (tx.vin.length === 1 && !tx.vin[0]?.prevout);

  const fromRaw: LabeledAddress[] = tx.vin
    .filter((input) => input.prevout)
    .map((input) =>
      labelAddress(
        input.prevout?.scriptpubkey_address,
        satsToBtc(input.prevout?.value ?? 0)
      )
    );

  const toRaw: LabeledAddress[] = tx.vout.map((output) =>
    labelAddress(output.scriptpubkey_address, satsToBtc(output.value || 0))
  );

  const from = mergeByAddress(fromRaw);
  const to = mergeByAddress(toRaw);

  const inputAddresses = new Set(from.map((row) => row.address));
  const toExcludingChange = to.filter((row) => !inputAddresses.has(row.address));
  const destinations = toExcludingChange.length > 0 ? toExcludingChange : to;

  const exchangeOutBtc = from
    .filter((row) => row.kind === "exchange")
    .reduce((sum, row) => sum + row.btc, 0);
  const walletOutBtc = from
    .filter((row) => row.kind === "wallet")
    .reduce((sum, row) => sum + row.btc, 0);
  const exchangeInBtc = destinations
    .filter((row) => row.kind === "exchange")
    .reduce((sum, row) => sum + row.btc, 0);
  const walletInBtc = destinations
    .filter((row) => row.kind === "wallet")
    .reduce((sum, row) => sum + row.btc, 0);

  let movement: MovementKind;
  const fromIsExchange = exchangeOutBtc > walletOutBtc;
  const toIsExchange = exchangeInBtc > walletInBtc;

  if (fromIsExchange && toIsExchange) {
    movement = "Exchange Internal";
  } else if (!fromIsExchange && toIsExchange) {
    movement = "Wallet to Exchange";
  } else if (fromIsExchange && !toIsExchange) {
    movement = "Exchange to Wallet";
  } else {
    movement = "Wallet to Wallet";
  }

  const primaryFrom =
    from[0] ??
    labelAddress(undefined, 0);
  const primaryTo =
    destinations[0] ??
    to[0] ??
    labelAddress(undefined, 0);

  return {
    from,
    to: destinations,
    primaryFrom,
    primaryTo,
    exchangeInBtc,
    exchangeOutBtc,
    walletInBtc,
    walletOutBtc,
    movement,
    isCoinbase,
  };
}

export function kindLabel(kind: AddressKind) {
  return kind === "exchange" ? "Exchange" : "Wallet";
}
