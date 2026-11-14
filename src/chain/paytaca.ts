import {
  binToHex,
  encodeTransaction,
  hash160,
  hexToBin,
  isPayToPublicKeyHash,
  type Output,
  type TransactionCommon,
} from "@bitauth/libauth";
import { sourceOutputToRelay } from "@wizardconnect/core/hdwalletv1-serialize";
import { childIndexOfPathName } from "@wizardconnect/core";

/** Paytaca derives exactly this child. A wrong index signs the wrong key and the coin does not move. */
export type InputPath = [number, "receive" | "change", number];

export type SessionPath = {
  name: "receive" | "change";
  childIndex: number;
};

/**
 * Pubkeys derived from the xpubs in the WizardConnect wallet_ready session.
 * `getPubkey` returns undefined when that path was not in the session.
 */
export type SessionLookup = {
  paths: SessionPath[];
  getPubkey: (childIndex: number, index: bigint) => Uint8Array | undefined;
};

/** How far along a session xpub we will walk. The match is exact; we never send an unmatched index. */
export const SESSION_INDEX_LIMIT = 500;

const PAYTACA_PATHS = ["receive", "change"] as const;

export function pathsFromSession(sessionPaths: { name: string }[]): SessionPath[] {
  const paths: SessionPath[] = [];
  for (const name of PAYTACA_PATHS) {
    if (!sessionPaths.some((path) => path.name === name)) continue;
    const childIndex = childIndexOfPathName(name);
    if (childIndex === undefined) continue;
    paths.push({ name, childIndex });
  }
  return paths;
}

/**
 * Find the receive or change index whose session-derived pubkey hashes to this
 * P2PKH locking script. Returns null when the session has no such key.
 * Callers must not substitute index 0.
 */
export function indexFromSession(
  lookup: SessionLookup,
  lockingBytecode: Uint8Array,
): { name: "receive" | "change"; addressIndex: number } | null {
  if (!isPayToPublicKeyHash(lockingBytecode)) return null;
  const want = binToHex(lockingBytecode.slice(3, 23));
  for (const path of lookup.paths) {
    for (let addressIndex = 0; addressIndex < SESSION_INDEX_LIMIT; addressIndex += 1) {
      const pubkey = lookup.getPubkey(path.childIndex, BigInt(addressIndex));
      if (!pubkey) break;
      if (binToHex(hash160(pubkey)) === want) {
        return { name: path.name, addressIndex };
      }
    }
  }
  return null;
}

export type PaytacaSignRequest = {
  transaction: {
    transaction: string;
    sourceOutputs: ReturnType<typeof sourceOutputToRelay>[];
    userPrompt: string;
    broadcast: false;
  };
  inputPaths: InputPath[];
};

/**
 * Shape a WizardConnect sign request the way Paytaca 1ee50a2 actually signs it.
 *
 * - inputPaths lists only this signer's inputs, with the session index.
 * - Those source outputs have an empty unlockingBytecode. Paytaca skips a
 *   P2PKH input whose source output already has one (`bch-sign.js`).
 * - Every other input keeps the unlocking bytecode already collected.
 * - broadcast is false. Paytaca broadcasts when the flag is omitted or true
 *   (`actions.js`).
 */
export function buildPaytacaSignRequest(args: {
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  signerIndexes: number[];
  locate: (lockingBytecode: Uint8Array) => { name: "receive" | "change"; addressIndex: number } | null;
  userPrompt: string;
}): PaytacaSignRequest {
  const signerIndexes = [...new Set(args.signerIndexes)].sort((a, b) => a - b);
  const inputPaths: InputPath[] = [];
  for (const index of signerIndexes) {
    const locking = args.sourceOutputs[index]?.lockingBytecode;
    if (!locking || !isPayToPublicKeyHash(locking)) {
      throw new Error(`Input ${index} is not a P2PKH coin. Paytaca is not asked to sign it.`);
    }
    const located = args.locate(locking);
    if (!located) {
      throw new Error(
        `Input ${index} does not match a receive or change key in this WizardConnect session. The address index is not guessed, because Paytaca would sign the wrong key.`,
      );
    }
    inputPaths.push([index, located.name, located.addressIndex]);
  }
  if (inputPaths.length !== signerIndexes.length) {
    throw new Error("inputPaths must cover exactly the signer's inputs.");
  }

  const signerSet = new Set(signerIndexes);
  const presented: TransactionCommon = {
    ...args.transaction,
    inputs: args.transaction.inputs.map((input, index) => ({
      ...input,
      unlockingBytecode: signerSet.has(index) ? new Uint8Array() : input.unlockingBytecode,
    })),
  };
  const sourceOutputs = presented.inputs.map((input, index) =>
    sourceOutputToRelay({
      outpointTransactionHash: input.outpointTransactionHash,
      outpointIndex: input.outpointIndex,
      sequenceNumber: input.sequenceNumber,
      unlockingBytecode: signerSet.has(index)
        ? new Uint8Array()
        : args.transaction.inputs[index]!.unlockingBytecode,
      valueSatoshis: args.sourceOutputs[index]?.valueSatoshis ?? 0n,
      lockingBytecode: args.sourceOutputs[index]?.lockingBytecode ?? new Uint8Array(),
      ...(args.sourceOutputs[index]?.token ? { token: args.sourceOutputs[index]!.token } : {}),
    }),
  );

  return {
    transaction: {
      transaction: binToHex(encodeTransaction(presented)),
      sourceOutputs,
      userPrompt: args.userPrompt,
      broadcast: false,
    },
    inputPaths,
  };
}

export function relayUnlockIsEmpty(value: unknown): boolean {
  return value === "" || value === undefined || (typeof value === "string" && hexToBin(value).length === 0);
}
