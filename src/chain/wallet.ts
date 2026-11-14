import { binToHex, encodeTransaction, hash160, hexToBin } from "@bitauth/libauth";
import { sourceOutputToRelay } from "@wizardconnect/core/hdwalletv1-serialize";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import type { Output, TransactionCommon } from "@bitauth/libauth";
import { mergeWalletSignature } from "./sign.ts";

const PATHS = [
  [0, "receive"],
  [1, "change"],
] as const;

export function findInputPaths(
  manager: DappConnectionManager,
  inputs: { index: number; lockingBytecode: Uint8Array }[],
): { paths: [number, "receive" | "change", number][]; missing: number[] } {
  const paths: [number, "receive" | "change", number][] = [];
  const missing: number[] = [];
  for (const input of inputs) {
    const want = binToHex(input.lockingBytecode.slice(3, 23));
    let found = false;
    for (const [child, name] of PATHS) {
      if (!manager.hasPath(child)) continue;
      for (let index = 0; index < 40; index += 1) {
        const pubkey = manager.getPubkey(child, BigInt(index));
        if (!pubkey) continue;
        if (binToHex(hash160(pubkey)) === want) {
          paths.push([input.index, name, index]);
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) missing.push(input.index);
  }
  return { paths, missing };
}

export async function signWithWallet(args: {
  manager: DappConnectionManager;
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  inputIndexes: number[];
  prompt: string;
}): Promise<TransactionCommon> {
  const inputs = args.transaction.inputs.map((input, index) => ({
    outpointTransactionHash: input.outpointTransactionHash,
    outpointIndex: input.outpointIndex,
    unlockingBytecode: input.unlockingBytecode,
    sequenceNumber: input.sequenceNumber,
    valueSatoshis: args.sourceOutputs[index]?.valueSatoshis ?? 0n,
    lockingBytecode: args.sourceOutputs[index]?.lockingBytecode ?? new Uint8Array(),
    ...(args.sourceOutputs[index]?.token ? { token: args.sourceOutputs[index]!.token } : {}),
  }));
  const owned = args.inputIndexes.map((index) => ({
    index,
    lockingBytecode: args.sourceOutputs[index]?.lockingBytecode ?? new Uint8Array(),
  }));
  const located = findInputPaths(args.manager, owned);
  if (located.missing.length > 0) {
    throw new Error(
      "This wallet did not share a key for every input it was asked to sign. Use “pay your share”, which only spends coins from the connected wallet.",
    );
  }
  const response = await args.manager.signTransaction({
    transaction: {
      transaction: binToHex(encodeTransaction(args.transaction)),
      sourceOutputs: inputs.map((input) => sourceOutputToRelay(input)),
      userPrompt: args.prompt,
      broadcast: false,
    },
    inputPaths: located.paths,
  });
  if (response.error || !response.signedTransaction) {
    throw new Error(response.error || "The wallet returned no signature.");
  }
  return mergeWalletSignature({
    base: args.transaction,
    signedHex: response.signedTransaction,
    inputIndexes: args.inputIndexes,
  });
}

export function lockingHex(bytecode: Uint8Array): string {
  return binToHex(bytecode);
}

export function sameLocking(left: string, right: Uint8Array): boolean {
  return left === binToHex(right);
}

export function hexLock(hex: string): Uint8Array {
  return hexToBin(hex);
}
