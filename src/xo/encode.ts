import {
  binToHex,
  decodeTransaction,
  encodeTransaction,
  hexToBin,
  type TransactionCommon,
} from "@bitauth/libauth";
import { deserializeInvitation, serializeInvitation } from "@xo-cash/utils";
import type { NetworkId } from "../chain/address.ts";
import type { BuiltSettlement } from "../chain/settle.ts";
import { transactionId } from "../chain/sign.ts";
import { openXoSession } from "./session.ts";

export class XoGapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XoGapError";
  }
}

export class XoInvitationMissingError extends Error {
  constructor(invitationIdentifier: string) {
    super(
      `This browser does not have XO invitation ${invitationIdentifier}. Broadcast continues through Settlemany's Electrum client.`,
    );
    this.name = "XoInvitationMissingError";
  }
}

export type XoSettlement = {
  transaction: TransactionCommon;
  invitationIdentifier: string;
  serializedInvitation: string;
  templateIdentifier: string;
};

const INVITE_PREFIX = "settlemany.xo.invitation.";

export function rememberInvitation(invitationIdentifier: string, serializedInvitation: string): void {
  try {
    sessionStorage.setItem(INVITE_PREFIX + invitationIdentifier, serializedInvitation);
  } catch {
    // The settle screen still holds the invitation in memory for the copy button.
  }
}

export function recallInvitation(invitationIdentifier: string): string | null {
  try {
    return sessionStorage.getItem(INVITE_PREFIX + invitationIdentifier);
  } catch {
    return null;
  }
}

/**
 * Build the settlement transaction through the XO engine.
 *
 * Coin selection and the exact output amounts stay in `buildSettlement`: the
 * engine can only select coins it tracks, and `addChangeToInvitation` returns
 * every leftover satoshi to one locking script. The clerk commits those inputs
 * and outputs, takes the debtor role (Paytaca cannot join an invitation), and
 * the engine encodes the transaction. The encoded bytes must match the classic
 * builder. Unlocking bytecode is left unset so a later commit can add the
 * wallet signatures. An empty unlocking script on the first commit counts as
 * already set and cannot be replaced.
 */
export async function encodeSettlementWithXo(args: {
  network: NetworkId;
  built: BuiltSettlement;
  memo?: string;
}): Promise<XoSettlement> {
  const { engine, templateIdentifier } = await openXoSession(args.network);
  const created = await engine.createInvitation({
    templateIdentifier,
    actionIdentifier: "settleGroup",
    roleIdentifier: "clerk",
    variables: [
      {
        variableIdentifier: "memoText",
        roleIdentifier: "clerk",
        value: (args.memo ?? "").slice(0, 80),
      },
    ],
    inputs: args.built.transaction.inputs.map((input, index) => ({
      inputIdentifier: "debtorInput",
      transactionIndex: index,
      outpointTransactionHash: input.outpointTransactionHash,
      outpointIndex: input.outpointIndex,
      sequenceNumber: input.sequenceNumber,
    })),
    outputs: args.built.transaction.outputs.map((output, index) => ({
      outputIdentifier: outputIdentifierAt(index, args.built),
      transactionIndex: index,
      lockingBytecode: output.lockingBytecode,
      valueSatoshis: output.valueSatoshis,
      ...(output.token
        ? { token: { category: output.token.category, amount: output.token.amount, ...(output.token.nft ? { nft: output.token.nft } : {}) } }
        : {}),
    })),
  });
  const invitationIdentifier = created.invitation.invitationIdentifier;
  await engine.joinInvitationRole(invitationIdentifier, "debtor");
  const encoded = await engine.buildInvitationTransactionFromMergedCommit(invitationIdentifier);
  const classicHex = binToHex(encodeTransaction(args.built.transaction));
  if (encoded.serializedTransaction !== classicHex) {
    throw new XoGapError(
      "XO encoded a different transaction than the settlement builder. Nothing was signed. Use the classic builder for this settlement.",
    );
  }
  const stored = await engine.getInvitation(invitationIdentifier);
  if (!stored) throw new XoInvitationMissingError(invitationIdentifier);
  const serializedInvitation = serializeInvitation(stored.invitation);
  rememberInvitation(invitationIdentifier, serializedInvitation);
  return {
    transaction: args.built.transaction,
    invitationIdentifier,
    serializedInvitation,
    templateIdentifier,
  };
}

/**
 * Write Paytaca's unlocking bytecode onto the invitation inputs that omitted it.
 * Returns the invitation string a judge can paste into the XO debug tool.
 */
export async function recordWalletSignatures(args: {
  network: NetworkId;
  invitationIdentifier: string;
  transaction: TransactionCommon;
}): Promise<string> {
  const { engine } = await openXoSession(args.network);
  const stored = await engine.getInvitation(args.invitationIdentifier);
  if (!stored) throw new XoInvitationMissingError(args.invitationIdentifier);
  const anchors = inputAnchors(stored.invitation.commits);
  const extensions = [];
  for (const input of args.transaction.inputs) {
    if (input.unlockingBytecode.length === 0) continue;
    const anchor = anchors.find((item) => sameOutpoint(item, input));
    if (!anchor) {
      throw new XoGapError("A signed input is not on the XO invitation.");
    }
    if (anchor.unlockLength > 0) continue;
    extensions.push({
      mergesWith: { commitIdentifier: anchor.commitIdentifier, itemIndex: anchor.itemIndex },
      unlockingBytecode: input.unlockingBytecode,
    });
  }
  if (extensions.length > 0) {
    await engine.appendInvitation(args.invitationIdentifier, {
      templateIdentifier: stored.invitation.templateIdentifier,
      actionIdentifier: stored.invitation.actionIdentifier,
      inputs: extensions,
    });
  }
  const encoded = await engine.buildInvitationTransactionFromMergedCommit(args.invitationIdentifier);
  const signedHex = binToHex(encodeTransaction(args.transaction));
  if (encoded.serializedTransaction !== signedHex) {
    throw new XoGapError("XO did not keep the transaction the wallets signed.");
  }
  const updated = await engine.getInvitation(args.invitationIdentifier);
  if (!updated) throw new XoInvitationMissingError(args.invitationIdentifier);
  const serialized = serializeInvitation(updated.invitation);
  rememberInvitation(args.invitationIdentifier, serialized);
  return serialized;
}

/** Record the invitation result and broadcast through the engine's Electrum client. */
export async function broadcastXoInvitation(args: {
  network: NetworkId;
  invitationIdentifier: string;
}): Promise<string> {
  const { engine } = await openXoSession(args.network);
  const { builtTransaction } = await engine.executeAction(args.invitationIdentifier, { broadcastTransaction: true });
  const decoded = decodeTransaction(hexToBin(builtTransaction.serializedTransaction));
  if (typeof decoded === "string") throw new Error(decoded);
  const updated = await engine.getInvitation(args.invitationIdentifier);
  if (updated) rememberInvitation(args.invitationIdentifier, serializeInvitation(updated.invitation));
  return transactionId(decoded);
}

export function invitationFromText(serialized: string) {
  return deserializeInvitation(serialized);
}

function outputIdentifierAt(index: number, built: BuiltSettlement): string {
  const output = built.transaction.outputs[index];
  if (!output || output.valueSatoshis === 0n) return "memoOutput";
  return index < built.payments.length ? "payeeOutput" : "changeOutput";
}

type Anchor = {
  commitIdentifier: string;
  itemIndex: number;
  outpointTransactionHash: Uint8Array;
  outpointIndex: number;
  unlockLength: number;
};

function inputAnchors(commits: { commitIdentifier: string; data: { inputs?: { mergesWith?: unknown; outpointTransactionHash?: Uint8Array; outpointIndex?: number; unlockingBytecode?: Uint8Array }[] } }[]): Anchor[] {
  const anchors: Anchor[] = [];
  for (const commit of commits) {
    const inputs = commit.data.inputs ?? [];
    inputs.forEach((input, itemIndex) => {
      if (input.mergesWith) return;
      if (!input.outpointTransactionHash || input.outpointIndex === undefined) return;
      anchors.push({
        commitIdentifier: commit.commitIdentifier,
        itemIndex,
        outpointTransactionHash: input.outpointTransactionHash,
        outpointIndex: input.outpointIndex,
        unlockLength: input.unlockingBytecode?.length ?? 0,
      });
    });
  }
  return anchors;
}

function sameOutpoint(
  anchor: Anchor,
  input: TransactionCommon["inputs"][number],
): boolean {
  return anchor.outpointIndex === input.outpointIndex && binToHex(anchor.outpointTransactionHash) === binToHex(input.outpointTransactionHash);
}
