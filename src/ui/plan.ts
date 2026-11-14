import { sha256 } from "@bitauth/libauth";
import { demoIdentity, lockingBytecodeForAddress, type NetworkId } from "../chain/address.ts";
import type { SpendableCoin } from "../chain/settle.ts";
import { usdCentsToSats } from "../domain/money.ts";
import type { Group } from "../domain/ledger.ts";
import type { Transfer } from "../domain/netting.ts";

export const DEMO_TOKEN_CATEGORY = [...sha256.hash(new TextEncoder().encode("settlemany-demo-token-v1"))]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

export function chainAmount(cents: number, asset: "bch" | "pusd", priceCents: number): bigint {
  if (asset === "pusd") return BigInt(cents);
  return usdCentsToSats(cents, priceCents);
}

export function pretendCoins(args: {
  group: Group;
  transfers: Transfer[];
  asset: "bch" | "pusd";
  network: NetworkId;
  categoryHex: string;
  priceCents: number;
}): SpendableCoin[] {
  const owed = new Map<string, bigint>();
  for (const transfer of args.transfers) {
    const amount = chainAmount(transfer.amountCents, args.asset, args.priceCents);
    owed.set(transfer.fromId, (owed.get(transfer.fromId) ?? 0n) + amount);
  }
  const coins: SpendableCoin[] = [];
  for (const [ownerId, amount] of owed) {
    const member = args.group.members.find((item) => item.id === ownerId);
    if (!member?.address) throw new Error(`${member?.name ?? ownerId} has no address yet.`);
    const lockingBytecode = lockingBytecodeForAddress(member.address);
    const base = sha256.hash(new TextEncoder().encode(`${ownerId}:${args.asset}:pretend`));
    const txid = [...base].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (args.asset === "bch") {
      coins.push({
        txid,
        vout: 0,
        satoshis: amount + 30_000n,
        lockingBytecode,
        tokenAmount: 0n,
        tokenCategoryHex: null,
        ownerId,
      });
    } else {
      coins.push({
        txid,
        vout: 0,
        satoshis: 5_000n,
        lockingBytecode,
        tokenAmount: amount,
        tokenCategoryHex: args.categoryHex,
        ownerId,
      });
      const feeId = sha256.hash(new TextEncoder().encode(`${ownerId}:fee:pretend`));
      coins.push({
        txid: [...feeId].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
        vout: 0,
        satoshis: 20_000n,
        lockingBytecode,
        tokenAmount: 0n,
        tokenCategoryHex: null,
        ownerId,
      });
    }
  }
  return coins;
}

export function demoKeys(group: Group): Record<string, Uint8Array> {
  const keys: Record<string, Uint8Array> = {};
  for (const member of group.members) {
    if (!member.demoKeyLabel) continue;
    const identity = demoIdentity(member.demoKeyLabel, "chipnet");
    if (identity.address === member.address) keys[member.id] = identity.privateKey;
  }
  return keys;
}
