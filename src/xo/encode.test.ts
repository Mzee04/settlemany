import { encodeTransaction, binToHex, sha256 } from "@bitauth/libauth";
import { afterAll, describe, expect, it } from "vitest";
import { demoIdentity } from "../chain/address.ts";
import { buildSettlement, type SpendableCoin } from "../chain/settle.ts";
import { signOwners, transactionId, verifySettlement } from "../chain/sign.ts";
import { encodeSettlementWithXo, invitationFromText, recordWalletSignatures } from "./encode.ts";
import { openXoSession, stopXoSession, XoEngineNetworkError } from "./session.ts";

const CATEGORY = "11".repeat(32);

function coin(ownerId: string, label: string, satoshis: bigint, tokenAmount = 0n): SpendableCoin {
  const identity = demoIdentity(ownerId);
  return {
    txid: [...sha256.hash(new TextEncoder().encode(label))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    vout: 0,
    satoshis,
    lockingBytecode: identity.lockingBytecode,
    tokenAmount,
    tokenCategoryHex: tokenAmount > 0n ? CATEGORY : null,
    ownerId,
  };
}

describe("XO engine encodes the group settlement", () => {
  afterAll(async () => {
    await stopXoSession();
  });

  const ada = demoIdentity("ada");
  const bob = demoIdentity("bob");
  const chidi = demoIdentity("chidi");
  const daya = demoIdentity("daya");
  const addresses = { ada: ada.address, bob: bob.address, chidi: chidi.address, daya: daya.address };
  const keys = { ada: ada.privateKey, bob: bob.privateKey };

  it("matches the classic transaction, then keeps both wallet signatures on the invitation", async () => {
    const built = buildSettlement({
      network: "chipnet",
      asset: "bch",
      transfers: [
        { fromId: "ada", toId: "chidi", amount: 60_000n },
        { fromId: "ada", toId: "daya", amount: 40_000n },
        { fromId: "bob", toId: "chidi", amount: 50_000n },
        { fromId: "bob", toId: "daya", amount: 25_000n },
      ],
      addresses,
      coins: [coin("ada", "ada-utxo", 200_000n), coin("bob", "bob-utxo", 150_000n)],
      memo: "Eko weekend",
    });
    const encoded = await encodeSettlementWithXo({ network: "chipnet", built, memo: "Eko weekend" });
    expect(binToHex(encodeTransaction(encoded.transaction))).toBe(binToHex(encodeTransaction(built.transaction)));
    expect(encoded.templateIdentifier).toMatch(/^[0-9a-f]{64}$/);

    const session = await openXoSession("chipnet");
    const before = await session.engine.listMissingRequirements(encoded.invitationIdentifier);
    expect(before.participants).toEqual([]);
    expect(before.inputsMissingSignatures).toHaveLength(built.transaction.inputs.length);

    const signed = signOwners({
      transaction: built.transaction,
      sourceOutputs: built.sourceOutputs,
      inputOwners: built.inputOwners,
      keys,
    });
    expect(verifySettlement(signed, built.sourceOutputs)).toBe(true);
    const serialized = await recordWalletSignatures({
      network: "chipnet",
      invitationIdentifier: encoded.invitationIdentifier,
      transaction: signed,
    });
    const restored = invitationFromText(serialized);
    expect(restored.invitationIdentifier).toBe(encoded.invitationIdentifier);
    expect(restored.templateIdentifier).toBe(encoded.templateIdentifier);
    expect(restored.actionIdentifier).toBe("settleGroup");

    const after = await session.engine.listMissingRequirements(encoded.invitationIdentifier);
    expect(after.inputsMissingSignatures).toEqual([]);
    const recorded = await session.engine.executeAction(encoded.invitationIdentifier, { broadcastTransaction: false });
    expect(recorded.builtTransaction.serializedTransaction).toBe(binToHex(encodeTransaction(signed)));
    expect(transactionId(signed)).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);

  it("matches a CashToken settlement byte for byte", async () => {
    const built = buildSettlement({
      network: "chipnet",
      asset: "pusd",
      tokenCategoryHex: CATEGORY,
      transfers: [
        { fromId: "ada", toId: "chidi", amount: 200n },
        { fromId: "bob", toId: "daya", amount: 50n },
      ],
      addresses,
      coins: [
        coin("ada", "ada-token", 2_000n, 500n),
        coin("ada", "ada-dust", 5_000n),
        coin("bob", "bob-token", 2_000n, 80n),
        coin("bob", "bob-dust", 5_000n),
      ],
      memo: "tokens",
    });
    const encoded = await encodeSettlementWithXo({ network: "chipnet", built, memo: "tokens" });
    expect(binToHex(encodeTransaction(encoded.transaction))).toBe(binToHex(encodeTransaction(built.transaction)));
    const signed = signOwners({
      transaction: built.transaction,
      sourceOutputs: built.sourceOutputs,
      inputOwners: built.inputOwners,
      keys,
    });
    expect(verifySettlement(signed, built.sourceOutputs)).toBe(true);
  }, 60_000);

  it("will not open a second network in the same tab", async () => {
    await openXoSession("chipnet");
    await expect(openXoSession("mainnet")).rejects.toBeInstanceOf(XoEngineNetworkError);
  });
});
