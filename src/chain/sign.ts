import {
  binToHex,
  createVirtualMachineBCH,
  decodeAuthenticationInstructions,
  decodeTransaction,
  encodeDataPush,
  encodeTransaction,
  flattenBinArray,
  generateSigningSerializationBCH,
  hash256,
  hashTransactionUiOrder,
  hexToBin,
  secp256k1,
  SigningSerializationType,
  type Output,
  type TransactionCommon,
} from "@bitauth/libauth";

/** SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_UTXOS. Commits to every input, output, and spent UTXO. */
export const SIGHASH_ALL_UTXOS = new Uint8Array([SigningSerializationType.allOutputsAllUtxos]);

const vm = createVirtualMachineBCH(true);

export function transactionId(transaction: TransactionCommon): string {
  return binToHex(hashTransactionUiOrder(encodeTransaction(transaction)));
}

export function signInput(args: {
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  inputIndex: number;
  privateKey: Uint8Array;
}): Uint8Array {
  const source = args.sourceOutputs[args.inputIndex];
  if (!source) throw new Error(`No source output for input ${args.inputIndex}`);
  const serialization = generateSigningSerializationBCH(
    {
      transaction: args.transaction,
      sourceOutputs: args.sourceOutputs,
      inputIndex: args.inputIndex,
    },
    { coveredBytecode: source.lockingBytecode, signingSerializationType: SIGHASH_ALL_UTXOS },
  );
  const digest = hash256(serialization);
  const signature = secp256k1.signMessageHashSchnorr(args.privateKey, digest);
  if (typeof signature === "string") throw new Error(signature);
  const signed = new Uint8Array(signature.length + 1);
  signed.set(signature);
  signed[signature.length] = SIGHASH_ALL_UTXOS[0]!;
  const publicKey = secp256k1.derivePublicKeyCompressed(args.privateKey);
  if (typeof publicKey === "string") throw new Error(publicKey);
  return flattenBinArray([encodeDataPush(signed), encodeDataPush(publicKey)]);
}

export function signOwners(args: {
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  inputOwners: string[];
  keys: Record<string, Uint8Array>;
  onlyOwnerId?: string;
}): TransactionCommon {
  const inputs = args.transaction.inputs.map((input, index) => {
    const owner = args.inputOwners[index];
    if (!owner) return input;
    if (args.onlyOwnerId && owner !== args.onlyOwnerId) return input;
    const key = args.keys[owner];
    if (!key) return input;
    return {
      ...input,
      unlockingBytecode: signInput({
        transaction: args.transaction,
        sourceOutputs: args.sourceOutputs,
        inputIndex: index,
        privateKey: key,
      }),
    };
  });
  return { ...args.transaction, inputs };
}

export function applyUnlocks(
  transaction: TransactionCommon,
  unlocks: Map<number, Uint8Array>,
): TransactionCommon {
  return {
    ...transaction,
    inputs: transaction.inputs.map((input, index) => ({
      ...input,
      unlockingBytecode: unlocks.get(index) ?? input.unlockingBytecode,
    })),
  };
}

export function verifySettlement(transaction: TransactionCommon, sourceOutputs: Output[]): true | string {
  return vm.verify({ transaction, sourceOutputs });
}

export function sighashOfUnlock(unlockingBytecode: Uint8Array): number | null {
  const instructions = decodeAuthenticationInstructions(unlockingBytecode);
  if (typeof instructions === "string" || instructions.length === 0) return null;
  const first = instructions[0];
  if (!first || !("data" in first) || !(first.data instanceof Uint8Array) || first.data.length === 0) return null;
  return first.data[first.data.length - 1] ?? null;
}

export function decodeSignedTransaction(hex: string): TransactionCommon {
  const decoded = decodeTransaction(hexToBin(hex));
  if (typeof decoded === "string") throw new Error(decoded);
  return decoded;
}

/**
 * Keep the agreed transaction and copy only the unlocks a signer was asked for.
 * Rejects a wallet that rewrote outputs or used a sighash other than 0x61.
 */
export function mergeWalletSignature(args: {
  base: TransactionCommon;
  signedHex: string;
  inputIndexes: number[];
}): TransactionCommon {
  const signed = decodeSignedTransaction(args.signedHex);
  if (signed.inputs.length !== args.base.inputs.length || signed.outputs.length !== args.base.outputs.length) {
    throw new Error("The wallet returned a different transaction shape. Nothing was merged.");
  }
  const baseHex = binToHex(encodeTransaction({ ...args.base, inputs: args.base.inputs.map(clearUnlock) }));
  const signedCleared = binToHex(encodeTransaction({ ...signed, inputs: signed.inputs.map(clearUnlock) }));
  if (baseHex !== signedCleared) {
    throw new Error("The wallet changed inputs or outputs. Settlemany rejected the signature.");
  }
  const unlocks = new Map<number, Uint8Array>();
  for (const index of args.inputIndexes) {
    const unlock = signed.inputs[index]?.unlockingBytecode;
    if (!unlock || unlock.length === 0) {
      throw new Error(`The wallet did not sign input ${index}.`);
    }
    const sighash = sighashOfUnlock(unlock);
    if (sighash !== 0x61) {
      throw new Error(
        `Input ${index} was signed with sighash ${sighash ?? "unknown"}, not SIGHASH_ALL|FORKID|UTXOS (0x61). Use the per-person fallback.`,
      );
    }
    unlocks.set(index, unlock);
  }
  return applyUnlocks(args.base, unlocks);
}

function clearUnlock(input: TransactionCommon["inputs"][number]): TransactionCommon["inputs"][number] {
  return { ...input, unlockingBytecode: new Uint8Array() };
}

export function signedIndexes(transaction: TransactionCommon): number[] {
  return transaction.inputs.flatMap((input, index) => (input.unlockingBytecode.length > 0 ? [index] : []));
}

export function outpointId(transaction: TransactionCommon, index: number): string {
  const input = transaction.inputs[index];
  if (!input) throw new Error("Missing input");
  return `${binToHex(input.outpointTransactionHash)}:${input.outpointIndex}`;
}
