import { binToHex, decodeTransaction, encodeTransaction, hexToBin, type Output, type TransactionCommon } from "@bitauth/libauth";
import type { NetworkId } from "./address.ts";
import type { AssetKind, BuiltSettlement } from "./settle.ts";

export type PacketLeg = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  usdCents: number;
  amount: string;
};

export type SigningPacket = {
  v: 1;
  groupId: string | null;
  groupName: string;
  network: NetworkId;
  asset: AssetKind;
  tokenCategoryHex: string | null;
  memo: string;
  txHex: string;
  sourceOutputs: {
    valueSatoshis: string;
    lockingBytecodeHex: string;
    tokenAmount: string | null;
    tokenCategoryHex: string | null;
  }[];
  inputs: { index: number; ownerId: string; ownerName: string }[];
  payments: { ownerId: string; ownerName: string; amount: string; satoshis: string }[];
  feeSats: string;
  legs: PacketLeg[];
  addresses: Record<string, string>;
  demo: boolean;
  createdAt: string;
  /** Set when the XO engine encoded this transaction. Absent on older links. */
  builder?: "xo" | "classic";
  invitationIdentifier?: string;
  xoTemplateIdentifier?: string;
};

export function settlementToPacket(args: {
  built: BuiltSettlement;
  names: Record<string, string>;
  groupId: string | null;
  groupName: string;
  network: NetworkId;
  asset: AssetKind;
  tokenCategoryHex: string | null;
  memo: string;
  legs: PacketLeg[];
  addresses: Record<string, string>;
  demo: boolean;
}): SigningPacket {
  return {
    v: 1,
    groupId: args.groupId,
    groupName: args.groupName,
    network: args.network,
    asset: args.asset,
    tokenCategoryHex: args.tokenCategoryHex,
    memo: args.memo,
    txHex: binToHex(encodeTransaction(args.built.transaction)),
    sourceOutputs: args.built.sourceOutputs.map((output) => ({
      valueSatoshis: output.valueSatoshis.toString(),
      lockingBytecodeHex: binToHex(output.lockingBytecode),
      tokenAmount: output.token ? output.token.amount.toString() : null,
      tokenCategoryHex: output.token ? binToHex(output.token.category) : null,
    })),
    inputs: args.built.inputOwners.map((ownerId, index) => ({
      index,
      ownerId,
      ownerName: args.names[ownerId] ?? ownerId,
    })),
    payments: args.built.payments.map((payment) => ({
      ownerId: payment.ownerId,
      ownerName: args.names[payment.ownerId] ?? payment.ownerId,
      amount: payment.amount.toString(),
      satoshis: payment.satoshis.toString(),
    })),
    feeSats: args.built.feeSats.toString(),
    legs: args.legs,
    addresses: args.addresses,
    demo: args.demo,
    createdAt: new Date().toISOString(),
  };
}

export function packetTransaction(packet: SigningPacket): {
  transaction: TransactionCommon;
  sourceOutputs: Output[];
  inputOwners: string[];
} {
  const decoded = decodeTransaction(hexToBin(packet.txHex));
  if (typeof decoded === "string") throw new Error(decoded);
  const sourceOutputs: Output[] = packet.sourceOutputs.map((output) => {
    const next: Output = {
      lockingBytecode: hexToBin(output.lockingBytecodeHex),
      valueSatoshis: BigInt(output.valueSatoshis),
    };
    if (output.tokenAmount && output.tokenCategoryHex) {
      next.token = { amount: BigInt(output.tokenAmount), category: hexToBin(output.tokenCategoryHex) };
    }
    return next;
  });
  return {
    transaction: decoded,
    sourceOutputs,
    inputOwners: packet.inputs.map((input) => input.ownerId),
  };
}

export function replaceTransaction(packet: SigningPacket, transaction: TransactionCommon): SigningPacket {
  return { ...packet, txHex: binToHex(encodeTransaction(transaction)) };
}
