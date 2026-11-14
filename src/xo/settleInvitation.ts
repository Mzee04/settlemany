import type { Output, TransactionCommon } from "@bitauth/libauth";
import { binToHex, decodeTransaction, hexToBin } from "@bitauth/libauth";
import { Crypto, convertMnemonicToSeedBytes } from "@xo-cash/crypto";
import {
  DEFAULT_COMMIT_EXPIRATION_IN_MILLISECONDS,
  InvitationBuilder,
  XO_SUPPORTED_NETWORKS,
  buildInvitationTransactionFromMergedCommit,
  generateCommitIdentifier,
  listMissingParticipants,
  mergeInvitationCommits,
  resolveHdKeyNetwork,
  validateInvitation,
  type XONetwork,
} from "@xo-cash/engine";
import type { XOInvitation, XOInvitationInput, XOInvitationOutput } from "@xo-cash/types";
import { deserializeInvitation, fromExtendedJson, serializeInvitation, toExtendedJson } from "@xo-cash/utils";
import type { NetworkId } from "../chain/address.ts";
import { transactionHex, type BuiltSettlement } from "../chain/settle.ts";
import {
  SETTLE_GROUP_ACTION,
  SETTLEMANY_TEMPLATE_IDENTIFIER,
  settlemanyTemplate,
  withCanonicalBigIntJson,
} from "./settlemanyTemplate.ts";

export class XoPathError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "XoPathError";
    this.code = code;
  }
}

export function xoNetwork(network: NetworkId): XONetwork {
  if (network === "chipnet") return XO_SUPPORTED_NETWORKS.chipnet;
  return XO_SUPPORTED_NETWORKS.mainnet;
}

/**
 * Describe an already-built settlement as an XO invitation and encode it with
 * the engine's merger. Coin selection stays in Settlemany: this XO release only
 * sees coins locked to scripts its own account generated, and Paytaca holds
 * the keys. The encoded transaction must match the classic builder byte for
 * byte. Wallet signatures are attached later with `applyWalletUnlocks`.
 */
export function compileSettlementInvitation(args: {
  built: BuiltSettlement;
  network: NetworkId;
  memo: string;
  coordinationMnemonic: string;
}): { invitation: string; templateIdentifier: string } {
  return withCanonicalBigIntJson(() => compileSettlementInvitationNow(args));
}

function compileSettlementInvitationNow(args: {
  built: BuiltSettlement;
  network: NetworkId;
  memo: string;
  coordinationMnemonic: string;
}): { invitation: string; templateIdentifier: string } {
  const network = xoNetwork(args.network);
  const crypto = openCrypto(args.coordinationMnemonic, network);
  try {
    const invitation = signInvitation(network, (builder) => {
      const now = Date.now();
      const commitIdentifier = generateCommitIdentifier();
      builder.addCommit(
        crypto.signInvitationCommitWithSchnorr({
          invitationIdentifier: builder.invitationIdentifier,
          rootCommitIdentifier: commitIdentifier,
          templateIdentifier: SETTLEMANY_TEMPLATE_IDENTIFIER,
          actionIdentifier: SETTLE_GROUP_ACTION,
          invitationCommit: {
            commitIdentifier,
            previousCommitIdentifier: undefined,
            createdAtTimestamp: now,
            expiresAtTimestamp: now + DEFAULT_COMMIT_EXPIRATION_IN_MILLISECONDS,
            data: {
              roleIdentifier: "coordinator",
              transactionVersion: 2,
              transactionLocktime: 0,
              variables: [
                {
                  variableIdentifier: "settlementMemo",
                  roleIdentifier: "coordinator",
                  value: args.memo,
                },
              ],
              inputs: invitationInputs(args.built),
              outputs: invitationOutputs(args.built),
            },
          },
        }),
      );
    });
    const missingParticipants = listMissingParticipants(
      invitation,
      settlemanyTemplate.actions[SETTLE_GROUP_ACTION]!,
    );
    if (missingParticipants.length > 0) {
      throw new XoPathError("xo-roles", "The XO template still requires a participant this settlement cannot invite.");
    }
    const encoded = encodeInvitationTransaction(invitation);
    const classic = transactionHex(args.built.transaction);
    if (encoded !== classic) {
      throw new XoPathError(
        "xo-shape",
        "XO encoded a different transaction than the settlement rules. Use the classic builder for this payment.",
      );
    }
    return { invitation: serializeInvitation(invitation), templateIdentifier: SETTLEMANY_TEMPLATE_IDENTIFIER };
  } finally {
    crypto.destroy();
  }
}

/**
 * Fold Paytaca unlocking bytecode into the invitation. The coordination phrase
 * must be the one that created it. A different browser leaves the invitation
 * unchanged; the transaction hex still carries the signatures.
 */
export function applyWalletUnlocks(args: {
  invitation: string;
  transaction: TransactionCommon;
  network: NetworkId;
  coordinationMnemonic: string;
}): string {
  return withCanonicalBigIntJson(() => applyWalletUnlocksNow(args));
}

function applyWalletUnlocksNow(args: {
  invitation: string;
  transaction: TransactionCommon;
  network: NetworkId;
  coordinationMnemonic: string;
}): string {
  const network = xoNetwork(args.network);
  const current = readInvitation(args.invitation);
  const crypto = openCrypto(args.coordinationMnemonic, network);
  try {
    if (!ownsInvitation(crypto, current)) return args.invitation;
    const merged = mergeInvitationCommits(current, settlemanyTemplate);
    const extensions: XOInvitationInput[] = [];
    for (const input of merged.inputs) {
      const index = input.transactionIndex;
      if (index === undefined) continue;
      const unlock = args.transaction.inputs[index]?.unlockingBytecode;
      if (!unlock || unlock.length === 0) continue;
      if (input.unlockingBytecode && input.unlockingBytecode.length > 0) continue;
      const source = findInputItem(current, input);
      if (!source) continue;
      extensions.push({
        mergesWith: { commitIdentifier: source.commitIdentifier, itemIndex: source.itemIndex },
        inputIdentifier: "debtorInput",
        unlockingBytecode: unlock,
      });
    }
    if (extensions.length === 0) return args.invitation;
    const updated = appendCommit(crypto, network, current, { inputs: extensions });
    validateInvitation(updated, settlemanyTemplate, network);
    return serializeInvitation(updated);
  } finally {
    crypto.destroy();
  }
}

/** Record the built transaction hash, and the broadcast, on the invitation. */
export function recordInvitationResult(args: {
  invitation: string;
  network: NetworkId;
  coordinationMnemonic: string;
  broadcasted: boolean;
}): string {
  return withCanonicalBigIntJson(() => recordInvitationResultNow(args));
}

function recordInvitationResultNow(args: {
  invitation: string;
  network: NetworkId;
  coordinationMnemonic: string;
  broadcasted: boolean;
}): string {
  const network = xoNetwork(args.network);
  const current = readInvitation(args.invitation);
  const crypto = openCrypto(args.coordinationMnemonic, network);
  try {
    if (!ownsInvitation(crypto, current)) return args.invitation;
    const built = buildInvitationTransactionFromMergedCommit(
      mergeInvitationCommits(current, settlemanyTemplate),
      settlemanyTemplate,
      SETTLE_GROUP_ACTION,
    );
    const root = current.commits[0];
    if (!root) return args.invitation;
    const builder = InvitationBuilder.fromInvitation(current, network);
    const created = crypto.signInvitationTransactionCreatedResult({
      invitationIdentifier: current.invitationIdentifier,
      templateIdentifier: current.templateIdentifier,
      rootCommitIdentifier: root.commitIdentifier,
      transactionHash: built.transactionHash,
      createdAtTimestamp: Date.now(),
    });
    if (builder.getResult()?.transactions?.groupSettlementTransaction === undefined) {
      builder.addTransactionCreatedResult("groupSettlementTransaction", created);
    }
    if (args.broadcasted) {
      const stored = builder.getResult()?.transactions?.groupSettlementTransaction;
      if (stored && !("broadcastedBySignature" in stored)) {
        builder.addTransactionBroadcastedResult(
          "groupSettlementTransaction",
          crypto.signInvitationTransactionBroadcastedResult({
            invitationIdentifier: current.invitationIdentifier,
            templateIdentifier: current.templateIdentifier,
            rootCommitIdentifier: root.commitIdentifier,
            transactionResult: stored,
            broadcastedAtTimestamp: Date.now(),
          }),
        );
      }
    }
    const next = builder.build();
    validateInvitation(next, settlemanyTemplate, network);
    return serializeInvitation(next);
  } finally {
    crypto.destroy();
  }
}

export function invitationTransaction(invitation: string): TransactionCommon {
  return withCanonicalBigIntJson(() => {
    const decoded = decodeTransaction(hexToBin(encodeInvitationTransaction(readInvitation(invitation))));
    if (typeof decoded === "string") throw new XoPathError("xo-decode", decoded);
    return decoded;
  });
}

/**
 * Signing links travel through JSON. A pass that drops XO's `<bigint: …n>` tags
 * leaves satoshi and token amounts as decimal strings, and the engine then
 * rejects the invitation. Restore those amounts before validation.
 */
function readInvitation(serialized: string): XOInvitation {
  const revived = reviveInvitationNumbers(fromExtendedJson(serialized));
  return deserializeInvitation(toExtendedJson(revived));
}

function reviveInvitationNumbers(value: unknown): unknown {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(reviveInvitationNumbers);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (isBigintField(key, record) && typeof child === "string" && /^-?\d+$/.test(child)) {
      next[key] = BigInt(child);
      continue;
    }
    next[key] = reviveInvitationNumbers(child);
  }
  return next;
}

function isBigintField(key: string, record: Record<string, unknown>): boolean {
  if (key === "valueSatoshis") return true;
  return key === "amount" && ("category" in record || "nft" in record);
}

function encodeInvitationTransaction(invitation: XOInvitation): string {
  validateInvitation(invitation, settlemanyTemplate, networkOfInvitation(invitation));
  const merged = mergeInvitationCommits(invitation, settlemanyTemplate);
  return buildInvitationTransactionFromMergedCommit(merged, settlemanyTemplate, SETTLE_GROUP_ACTION).serializedTransaction;
}

function networkOfInvitation(invitation: XOInvitation): XONetwork {
  const entity = invitation.commits[0]?.entityIdentifier ?? "";
  if (entity.startsWith("tpub")) return XO_SUPPORTED_NETWORKS.chipnet;
  return XO_SUPPORTED_NETWORKS.mainnet;
}

function invitationInputs(built: BuiltSettlement): XOInvitationInput[] {
  return built.transaction.inputs.map((input, index) => ({
    inputIdentifier: "debtorInput",
    transactionIndex: index,
    outpointTransactionHash: input.outpointTransactionHash,
    outpointIndex: input.outpointIndex,
    sequenceNumber: input.sequenceNumber,
    unlockingBytecode: input.unlockingBytecode,
  }));
}

function invitationOutputs(built: BuiltSettlement): XOInvitationOutput[] {
  const paymentCount = built.payments.length;
  return built.transaction.outputs.map((output, index) => {
    const outputIdentifier = outputIdentifierFor(output, index, paymentCount);
    const next: XOInvitationOutput = {
      outputIdentifier,
      transactionIndex: index,
      lockingBytecode: output.lockingBytecode,
      valueSatoshis: output.valueSatoshis,
    };
    if (output.token) {
      next.token = {
        amount: output.token.amount,
        category: output.token.category,
        ...(output.token.nft ? { nft: { capability: output.token.nft.capability, commitment: output.token.nft.commitment } } : {}),
      };
    }
    return next;
  });
}

function outputIdentifierFor(output: Output, index: number, paymentCount: number): string {
  if (output.valueSatoshis === 0n && output.lockingBytecode[0] === 0x6a) return "settlementMemo";
  if (index < paymentCount) return "creditorPayment";
  return "debtorChange";
}

function signInvitation(network: XONetwork, fill: (builder: InvitationBuilder) => void): XOInvitation {
  const builder = new InvitationBuilder(
    {
      templateIdentifier: SETTLEMANY_TEMPLATE_IDENTIFIER,
      actionIdentifier: SETTLE_GROUP_ACTION,
    },
    network,
  );
  fill(builder);
  const invitation = builder.build();
  validateInvitation(invitation, settlemanyTemplate, network);
  return invitation;
}

function appendCommit(
  crypto: Crypto,
  network: XONetwork,
  invitation: XOInvitation,
  data: XOInvitation["commits"][number]["data"],
): XOInvitation {
  const root = invitation.commits[0];
  const previous = invitation.commits[invitation.commits.length - 1];
  if (!root || !previous) throw new XoPathError("xo-commit", "The invitation has no commit to extend.");
  const builder = InvitationBuilder.fromInvitation(invitation, network);
  const now = Date.now();
  const commitIdentifier = generateCommitIdentifier();
  builder.addCommit(
    crypto.signInvitationCommitWithSchnorr({
      invitationIdentifier: invitation.invitationIdentifier,
      rootCommitIdentifier: root.commitIdentifier,
      templateIdentifier: invitation.templateIdentifier,
      actionIdentifier: invitation.actionIdentifier,
      invitationCommit: {
        commitIdentifier,
        previousCommitIdentifier: previous.commitIdentifier,
        createdAtTimestamp: now,
        expiresAtTimestamp: now + DEFAULT_COMMIT_EXPIRATION_IN_MILLISECONDS,
        data,
      },
    }),
  );
  return builder.build();
}

function ownsInvitation(crypto: Crypto, invitation: XOInvitation): boolean {
  const root = invitation.commits[0];
  if (!root) return false;
  const entity = crypto.deriveInvitationEntityIdentifier({
    templateIdentifier: invitation.templateIdentifier,
    rootCommitIdentifier: root.commitIdentifier,
  });
  return entity === root.entityIdentifier;
}

function findInputItem(
  invitation: XOInvitation,
  input: { outpointTransactionHash?: Uint8Array; outpointIndex?: number },
): { commitIdentifier: string; itemIndex: number } | undefined {
  if (!input.outpointTransactionHash || input.outpointIndex === undefined) return undefined;
  const want = binToHex(input.outpointTransactionHash);
  for (const commit of invitation.commits) {
    const inputs = commit.data.inputs ?? [];
    for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
      const candidate = inputs[itemIndex];
      if (!candidate?.outpointTransactionHash || candidate.outpointIndex === undefined) continue;
      if (candidate.outpointIndex === input.outpointIndex && binToHex(candidate.outpointTransactionHash) === want) {
        return { commitIdentifier: commit.commitIdentifier, itemIndex };
      }
    }
  }
  return undefined;
}

function openCrypto(mnemonic: string, network: XONetwork): Crypto {
  return new Crypto(convertMnemonicToSeedBytes(mnemonic), { network: resolveHdKeyNetwork(network) });
}
