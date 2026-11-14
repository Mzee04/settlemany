import { binToHex, type TransactionCommon } from "@bitauth/libauth";

export type Outpoint = { txid: string; vout: number };

export function inputOutpoints(transaction: TransactionCommon): Outpoint[] {
  return transaction.inputs.map((input) => ({
    txid: binToHex(input.outpointTransactionHash),
    vout: input.outpointIndex,
  }));
}

/** Indexes whose outpoints are no longer in the live UTXO set. */
export function staleInputIndexes(transaction: TransactionCommon, live: Outpoint[]): number[] {
  const have = new Set(live.map((outpoint) => `${outpoint.txid}:${outpoint.vout}`));
  return inputOutpoints(transaction).flatMap((outpoint, index) =>
    have.has(`${outpoint.txid}:${outpoint.vout}`) ? [] : [index],
  );
}
