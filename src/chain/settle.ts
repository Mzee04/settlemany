import {
  binToHex,
  encodeDataPush,
  encodeTransaction,
  flattenBinArray,
  hexToBin,
  isPayToPublicKeyHash,
  utf8ToBin,
  type Input,
  type Output,
  type TransactionCommon,
} from "@bitauth/libauth";
import { assertAddressOnNetwork, type NetworkId } from "./address.ts";
import { allocateBigint } from "../domain/money.ts";

export const DUST_SATS = 546n;
export const TOKEN_OUTPUT_SATS = 800n;
/** Upper bound of a P2PKH unlock (DER signature + sighash + compressed pubkey). */
const UNLOCK_ESTIMATE_BYTES = 110;
const FEE_RATE = 1n;

export type AssetKind = "bch" | "pusd";

export type SpendableCoin = {
  txid: string;
  vout: number;
  satoshis: bigint;
  lockingBytecode: Uint8Array;
  tokenAmount: bigint;
  tokenCategoryHex: string | null;
  ownerId: string;
};

export type SettleTransfer = {
  fromId: string;
  toId: string;
  /** Satoshis for BCH, token base units for PUSD. */
  amount: bigint;
};

export type SettleRequest = {
  network: NetworkId;
  asset: AssetKind;
  tokenCategoryHex?: string;
  transfers: SettleTransfer[];
  addresses: Record<string, string>;
  coins: SpendableCoin[];
  memo?: string;
  feeRateSatPerByte?: bigint;
};

export type BuiltSettlement = {
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  inputOwners: string[];
  feeSats: bigint;
  payments: { ownerId: string; amount: bigint; satoshis: bigint }[];
};

export type SettleErrorDetail = {
  shortSats?: bigint;
  haveSats?: bigint;
  needSats?: bigint;
  debtorId?: string;
};

export class SettleError extends Error {
  readonly code: string;
  readonly detail: SettleErrorDetail;

  constructor(code: string, message: string, detail: SettleErrorDetail = {}) {
    super(message);
    this.name = "SettleError";
    this.code = code;
    this.detail = detail;
  }
}

type PartyTotal = { id: string; amount: bigint };

export function buildSettlement(request: SettleRequest): BuiltSettlement {
  const feeRate = request.feeRateSatPerByte ?? FEE_RATE;
  if (feeRate <= 0n) throw new SettleError("fee", "Fee rate must be positive");
  const aggregated = aggregate(request.transfers);
  if (aggregated.debtors.length === 0) throw new SettleError("empty", "Nobody owes anything.");
  const categoryHex = request.asset === "pusd" ? normalizeCategory(request.tokenCategoryHex) : null;
  if (request.asset === "bch") {
    for (const creditor of aggregated.creditors) {
      if (creditor.amount < DUST_SATS) {
        throw new SettleError(
          "below-dust",
          "A BCH payment is below the 546 satoshi dust limit. Settle in PUSD, or wait until the dollar amount converts to at least 546 sats.",
        );
      }
    }
  }

  const addresses = request.addresses;
  const locking = new Map<string, Uint8Array>();
  for (const party of [...aggregated.debtors, ...aggregated.creditors]) {
    const address = addresses[party.id];
    if (!address) throw new SettleError("address", `Missing a CashTokens address for ${party.id}`);
    locking.set(party.id, assertAddressOnNetwork(address, request.network));
  }

  let feeGuess = 0n;
  let chosen: SpendableCoin[] = [];
  let tokenChange = new Map<string, bigint>();
  for (let round = 0; round < 8; round += 1) {
    const selection = selectCoins(request, aggregated, categoryHex, feeGuess);
    chosen = selection.coins;
    tokenChange = selection.tokenChange;
    const draft = assemble({
      request,
      aggregated,
      coins: chosen,
      tokenChange,
      feeGuess,
      categoryHex,
      locking,
    });
    const required = BigInt(measure(draft.transaction)) * feeRate;
    if (required <= feeGuess) {
      const feeSats = satoshiSum(draft.transaction.inputs.map((_, index) => draft.sourceOutputs[index]!.valueSatoshis)) -
        satoshiSum(draft.transaction.outputs.map((output) => output.valueSatoshis));
      assertConserved(draft, categoryHex, feeRate);
      return { ...draft, feeSats };
    }
    feeGuess = required;
  }
  throw new SettleError("fee", "Could not find a fee that the selected coins can cover. Add a few more satoshis and try again.");
}

function selectCoins(
  request: SettleRequest,
  aggregated: { debtors: PartyTotal[]; creditors: PartyTotal[] },
  categoryHex: string | null,
  feeGuess: bigint,
): { coins: SpendableCoin[]; tokenChange: Map<string, bigint> } {
  const feeShares = sharesOf(feeGuess, aggregated.debtors);
  const creditorDust = request.asset === "pusd" ? TOKEN_OUTPUT_SATS * BigInt(aggregated.creditors.length) : 0n;
  const dustShares = sharesOf(creditorDust, aggregated.debtors);
  const chosen: SpendableCoin[] = [];
  const tokenChange = new Map<string, bigint>();

  for (const debtor of aggregated.debtors) {
    const mine = request.coins.filter(
      (coin) => coin.ownerId === debtor.id && isPayToPublicKeyHash(coin.lockingBytecode),
    );
    const picked: SpendableCoin[] = [];
    let tokenIn = 0n;
    if (request.asset === "pusd") {
      const tokenCoins = mine
        .filter((coin) => coin.tokenAmount > 0n && coin.tokenCategoryHex === categoryHex)
        .sort(compareTokenCoins);
      for (const coin of tokenCoins) {
        if (tokenIn >= debtor.amount) break;
        picked.push(coin);
        tokenIn += coin.tokenAmount;
      }
      if (tokenIn < debtor.amount) {
        throw new SettleError(
          "need-token",
          `${debtor.id} needs ${debtor.amount.toString()} token units and the wallet only has ${tokenIn.toString()}.`,
        );
      }
      tokenChange.set(debtor.id, tokenIn - debtor.amount);
    }
    const changeDust = (tokenChange.get(debtor.id) ?? 0n) > 0n ? TOKEN_OUTPUT_SATS : 0n;
    const paymentSats = request.asset === "bch" ? debtor.amount : 0n;
    const satsNeed = paymentSats + (feeShares.get(debtor.id) ?? 0n) + (dustShares.get(debtor.id) ?? 0n) + changeDust;
    let sats = picked.reduce((sum, coin) => sum + coin.satoshis, 0n);
    const plain = mine.filter((coin) => coin.tokenAmount === 0n && !picked.includes(coin)).sort(compareSats);
    for (const coin of plain) {
      if (sats >= satsNeed) break;
      picked.push(coin);
      sats += coin.satoshis;
    }
    if (sats < satsNeed) {
      const short = satsNeed - sats;
      throw new SettleError("need-bch", `Short ${short} satoshis for the payment, token dust, and miner fee.`, {
        shortSats: short,
        haveSats: sats,
        needSats: satsNeed,
        debtorId: debtor.id,
      });
    }
    chosen.push(...picked);
  }

  chosen.sort((a, b) => {
    if (a.ownerId !== b.ownerId) return a.ownerId < b.ownerId ? -1 : 1;
    if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
    return a.vout - b.vout;
  });
  return { coins: chosen, tokenChange };
}

function assemble(args: {
  request: SettleRequest;
  aggregated: { debtors: PartyTotal[]; creditors: PartyTotal[] };
  coins: SpendableCoin[];
  tokenChange: Map<string, bigint>;
  feeGuess: bigint;
  categoryHex: string | null;
  locking: Map<string, Uint8Array>;
}): { transaction: TransactionCommon; sourceOutputs: Output[]; inputOwners: string[]; payments: BuiltSettlement["payments"] } {
  const { request, aggregated, coins, tokenChange, feeGuess, categoryHex, locking } = args;
  const feeShares = sharesOf(feeGuess, aggregated.debtors);
  const creditorDust = request.asset === "pusd" ? TOKEN_OUTPUT_SATS * BigInt(aggregated.creditors.length) : 0n;
  const dustShares = sharesOf(creditorDust, aggregated.debtors);
  const category = categoryHex ? hexToBin(categoryHex) : null;

  const outputs: Output[] = [];
  const payments: BuiltSettlement["payments"] = [];
  for (const creditor of [...aggregated.creditors].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const bytecode = locking.get(creditor.id)!;
    if (request.asset === "bch") {
      outputs.push({ lockingBytecode: bytecode, valueSatoshis: creditor.amount });
      payments.push({ ownerId: creditor.id, amount: creditor.amount, satoshis: creditor.amount });
    } else {
      outputs.push({
        lockingBytecode: bytecode,
        valueSatoshis: TOKEN_OUTPUT_SATS,
        token: { amount: creditor.amount, category: category! },
      });
      payments.push({ ownerId: creditor.id, amount: creditor.amount, satoshis: TOKEN_OUTPUT_SATS });
    }
  }

  for (const debtor of [...aggregated.debtors].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const changeTokens = tokenChange.get(debtor.id) ?? 0n;
    const changeDust = changeTokens > 0n ? TOKEN_OUTPUT_SATS : 0n;
    if (changeTokens > 0n) {
      outputs.push({
        lockingBytecode: locking.get(debtor.id)!,
        valueSatoshis: TOKEN_OUTPUT_SATS,
        token: { amount: changeTokens, category: category! },
      });
    }
    const satsIn = coins.filter((coin) => coin.ownerId === debtor.id).reduce((sum, coin) => sum + coin.satoshis, 0n);
    const paymentSats = request.asset === "bch" ? debtor.amount : 0n;
    const reserved = paymentSats + (feeShares.get(debtor.id) ?? 0n) + (dustShares.get(debtor.id) ?? 0n) + changeDust;
    const change = satsIn - reserved;
    if (change < 0n) {
      throw new SettleError("need-bch", `${debtor.id} does not have enough BCH once the fee is included.`);
    }
    if (change >= DUST_SATS) {
      outputs.push({ lockingBytecode: locking.get(debtor.id)!, valueSatoshis: change });
    }
  }

  const memo = cleanMemo(request.memo);
  if (memo) {
    outputs.push({ lockingBytecode: opReturn(memo), valueSatoshis: 0n });
  }

  const inputs: Input[] = coins.map((coin) => ({
    outpointIndex: coin.vout,
    outpointTransactionHash: hexToBin(coin.txid),
    sequenceNumber: 0xffffffff,
    unlockingBytecode: new Uint8Array(),
  }));
  const sourceOutputs: Output[] = coins.map((coin) => {
    const output: Output = {
      lockingBytecode: coin.lockingBytecode,
      valueSatoshis: coin.satoshis,
    };
    if (coin.tokenAmount > 0n && coin.tokenCategoryHex) {
      output.token = { amount: coin.tokenAmount, category: hexToBin(coin.tokenCategoryHex) };
    }
    return output;
  });

  return {
    transaction: { version: 2, locktime: 0, inputs, outputs },
    sourceOutputs,
    inputOwners: coins.map((coin) => coin.ownerId),
    payments,
  };
}

function assertConserved(
  built: { transaction: TransactionCommon; sourceOutputs: Output[]; payments: BuiltSettlement["payments"] },
  categoryHex: string | null,
  feeRate: bigint,
): void {
  const inSats = built.sourceOutputs.reduce((sum, output) => sum + output.valueSatoshis, 0n);
  const outSats = built.transaction.outputs.reduce((sum, output) => sum + output.valueSatoshis, 0n);
  if (inSats < outSats) throw new SettleError("balance", "Outputs exceed inputs");
  const fee = inSats - outSats;
  const minimum = BigInt(measure(built.transaction)) * feeRate;
  if (fee < minimum) throw new SettleError("fee", "Fee fell below the relay rate while building the transaction");
  if (!categoryHex) return;
  const tokenIn = built.sourceOutputs.reduce((sum, output) => sum + (output.token?.amount ?? 0n), 0n);
  const tokenOut = built.transaction.outputs.reduce((sum, output) => sum + (output.token?.amount ?? 0n), 0n);
  if (tokenIn !== tokenOut) throw new SettleError("token", "Token inputs and outputs do not match");
  const paid = built.payments.reduce((sum, payment) => sum + payment.amount, 0n);
  if (paid <= 0n) throw new SettleError("empty", "Token payment total was zero");
}

function sharesOf(total: bigint, debtors: PartyTotal[]): Map<string, bigint> {
  const rows = allocateBigint(
    total,
    debtors.map((debtor) => ({ id: debtor.id, weight: debtor.amount })),
  );
  return new Map(rows.map((row) => [row.id, row.amount]));
}

function aggregate(transfers: SettleTransfer[]): { debtors: PartyTotal[]; creditors: PartyTotal[] } {
  const debtors = new Map<string, bigint>();
  const creditors = new Map<string, bigint>();
  for (const transfer of transfers) {
    if (transfer.amount <= 0n) continue;
    if (transfer.fromId === transfer.toId) continue;
    debtors.set(transfer.fromId, (debtors.get(transfer.fromId) ?? 0n) + transfer.amount);
    creditors.set(transfer.toId, (creditors.get(transfer.toId) ?? 0n) + transfer.amount);
  }
  const toList = (map: Map<string, bigint>) =>
    [...map.entries()]
      .map(([id, amount]) => ({ id, amount }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  return { debtors: toList(debtors), creditors: toList(creditors) };
}

function compareSats(a: SpendableCoin, b: SpendableCoin): number {
  if (a.satoshis !== b.satoshis) return a.satoshis > b.satoshis ? -1 : 1;
  if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
  return a.vout - b.vout;
}

function compareTokenCoins(a: SpendableCoin, b: SpendableCoin): number {
  if (a.tokenAmount !== b.tokenAmount) return a.tokenAmount > b.tokenAmount ? -1 : 1;
  if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
  return a.vout - b.vout;
}

function satoshiSum(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

function measure(transaction: TransactionCommon): number {
  const placeholder = new Uint8Array(UNLOCK_ESTIMATE_BYTES);
  const estimated: TransactionCommon = {
    ...transaction,
    inputs: transaction.inputs.map((input) => ({
      ...input,
      unlockingBytecode: input.unlockingBytecode.length > 0 ? input.unlockingBytecode : placeholder,
    })),
  };
  return encodeTransaction(estimated).length;
}

function normalizeCategory(category: string | undefined): string {
  const hex = (category ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new SettleError("category", "A CashToken category is a 64-character hex id.");
  }
  return hex;
}

function cleanMemo(memo: string | undefined): string {
  return (memo ?? "").replace(/[^\x20-\x7e]/g, " ").trim().slice(0, 80);
}

function opReturn(memo: string): Uint8Array {
  return flattenBinArray([Uint8Array.of(0x6a), encodeDataPush(utf8ToBin(memo))]);
}

export function transactionHex(transaction: TransactionCommon): string {
  return binToHex(encodeTransaction(transaction));
}
