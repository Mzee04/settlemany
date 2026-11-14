import { encodeTransaction, sha256 } from "@bitauth/libauth";
import { describe, expect, it } from "vitest";
import { demoIdentity } from "./address.ts";
import { buildSettlement, DUST_SATS, SettleError, transactionHex, type SpendableCoin } from "./settle.ts";
import { mergeWalletSignature, sighashOfUnlock, signOwners, transactionId, verifySettlement } from "./sign.ts";
import { staleInputIndexes } from "./stale.ts";

const CATEGORY = "11".repeat(32);

function coin(ownerId: string, label: string, satoshis: bigint, tokenAmount = 0n): SpendableCoin {
  const identity = demoIdentity(ownerId);
  return {
    txid: txid(label),
    vout: 0,
    satoshis,
    lockingBytecode: identity.lockingBytecode,
    tokenAmount,
    tokenCategoryHex: tokenAmount > 0n ? CATEGORY : null,
    ownerId,
  };
}

function txid(label: string): string {
  const bytes = sha256.hash(new TextEncoder().encode(label));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function party(label: string) {
  return demoIdentity(label);
}

describe("multi-party settlement on BCH consensus rules", () => {
  const ada = party("ada");
  const bob = party("bob");
  const chidi = party("chidi");
  const daya = party("daya");

  const addresses = {
    ada: ada.address,
    bob: bob.address,
    chidi: chidi.address,
    daya: daya.address,
  };

  const transfers = [
    { fromId: "ada", toId: "chidi", amount: 60_000n },
    { fromId: "ada", toId: "daya", amount: 40_000n },
    { fromId: "bob", toId: "chidi", amount: 50_000n },
    { fromId: "bob", toId: "daya", amount: 25_000n },
  ];

  const coins = [
    coin("ada", "ada-utxo", 200_000n),
    coin("bob", "bob-utxo", 150_000n),
  ];

  const keys = { ada: ada.privateKey, bob: bob.privateKey };

  function built() {
    return buildSettlement({
      network: "chipnet",
      asset: "bch",
      transfers,
      addresses,
      coins,
      memo: "Eko weekend",
    });
  }

  it("pays both creditors exactly and keeps addresses on chipnet", () => {
    const settlement = built();
    expect(ada.address.startsWith("bchtest:")).toBe(true);
    const paid = new Map(settlement.payments.map((payment) => [payment.ownerId, payment.amount]));
    expect(paid.get("chidi")).toBe(110_000n);
    expect(paid.get("daya")).toBe(65_000n);
    expect(settlement.feeSats).toBeGreaterThan(0n);
    const creditorValues = settlement.transaction.outputs
      .filter((output) => output.valueSatoshis === 110_000n || output.valueSatoshis === 65_000n)
      .map((output) => output.valueSatoshis)
      .sort((a, b) => (a < b ? -1 : 1));
    expect(creditorValues).toEqual([65_000n, 110_000n]);
  });

  it("is consensus-valid, order-independent, and uses sighash 0x61", () => {
    const settlement = built();
    const adaFirst = signOwners({
      transaction: signOwners({
        transaction: settlement.transaction,
        sourceOutputs: settlement.sourceOutputs,
        inputOwners: settlement.inputOwners,
        keys,
        onlyOwnerId: "ada",
      }),
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
      onlyOwnerId: "bob",
    });
    const bobFirst = signOwners({
      transaction: signOwners({
        transaction: settlement.transaction,
        sourceOutputs: settlement.sourceOutputs,
        inputOwners: settlement.inputOwners,
        keys,
        onlyOwnerId: "bob",
      }),
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
      onlyOwnerId: "ada",
    });
    expect(transactionHex(adaFirst)).toBe(transactionHex(bobFirst));
    expect(verifySettlement(adaFirst, settlement.sourceOutputs)).toBe(true);
    for (const input of adaFirst.inputs) {
      expect(sighashOfUnlock(input.unlockingBytecode)).toBe(0x61);
    }
    const onlyAda = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
      onlyOwnerId: "ada",
    });
    expect(verifySettlement(onlyAda, settlement.sourceOutputs)).not.toBe(true);
  });

  it("commits to the whole transaction, so an edited output cannot reuse the signatures", () => {
    const settlement = built();
    const signed = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
    });
    const tampered = {
      ...signed,
      outputs: signed.outputs.map((output, index) =>
        index === 0 ? { ...output, valueSatoshis: output.valueSatoshis + 1n } : output,
      ),
    };
    expect(verifySettlement(tampered, settlement.sourceOutputs)).not.toBe(true);
  });

  it("detects a stale input, rebuilds without it, and requires fresh signatures", () => {
    const settlement = built();
    const signed = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
    });
    const live = coins.filter((entry) => entry.ownerId !== "ada");
    const stale = staleInputIndexes(settlement.transaction, live);
    expect(stale.length).toBeGreaterThan(0);
    const replacement = coin("ada", "ada-replacement", 210_000n);
    const rebuilt = buildSettlement({
      network: "chipnet",
      asset: "bch",
      transfers,
      addresses,
      coins: [replacement, ...live],
      memo: "Eko weekend",
    });
    expect(transactionId(rebuilt.transaction)).not.toBe(transactionId(signed));
    expect(staleInputIndexes(rebuilt.transaction, [replacement, ...live])).toEqual([]);
    const recycled = {
      ...rebuilt.transaction,
      inputs: rebuilt.transaction.inputs.map((input, index) => ({
        ...input,
        unlockingBytecode: signed.inputs[index]?.unlockingBytecode ?? input.unlockingBytecode,
      })),
    };
    expect(verifySettlement(recycled, rebuilt.sourceOutputs)).not.toBe(true);
    const resigned = signOwners({
      transaction: rebuilt.transaction,
      sourceOutputs: rebuilt.sourceOutputs,
      inputOwners: rebuilt.inputOwners,
      keys,
    });
    expect(verifySettlement(resigned, rebuilt.sourceOutputs)).toBe(true);
    expect(rebuilt.payments.map((payment) => payment.amount).sort((a, b) => (a < b ? -1 : 1))).toEqual([
      65_000n,
      110_000n,
    ]);
  });

  it("rejects a partial signature that uses a weaker sighash", () => {
    const settlement = built();
    const signed = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
      onlyOwnerId: "ada",
    });
    const adaIndex = settlement.inputOwners.indexOf("ada");
    const unlock = signed.inputs[adaIndex]!.unlockingBytecode;
    const weakened = new Uint8Array(unlock);
    expect(unlock[65]).toBe(0x61);
    weakened[65] = 0x41;
    const forgedHex = transactionHex({
      ...settlement.transaction,
      inputs: settlement.transaction.inputs.map((input, index) =>
        index === adaIndex ? { ...input, unlockingBytecode: weakened } : input,
      ),
    });
    expect(() =>
      mergeWalletSignature({
        base: settlement.transaction,
        signedHex: forgedHex,
        inputIndexes: [adaIndex],
      }),
    ).toThrow(/0x61/);
  });
});

describe("CashToken settlement", () => {
  it("pays exact token amounts and conserves the category, with BCH only for dust and fee", () => {
    const ada = party("token-ada");
    const bob = party("token-bob");
    const chidi = party("token-chidi");
    const daya = party("token-daya");
    const settlement = buildSettlement({
      network: "chipnet",
      asset: "pusd",
      tokenCategoryHex: CATEGORY,
      memo: "PUSD dinner",
      transfers: [
        { fromId: "ada", toId: "chidi", amount: 3_000n },
        { fromId: "ada", toId: "daya", amount: 2_000n },
        { fromId: "bob", toId: "chidi", amount: 1_000n },
        { fromId: "bob", toId: "daya", amount: 1_500n },
      ],
      addresses: {
        ada: ada.address,
        bob: bob.address,
        chidi: chidi.address,
        daya: daya.address,
      },
      coins: [
        coinOf(ada, "ada-token", 8_000n, 5_000n),
        coinOf(ada, "ada-bch", 20_000n, 0n),
        coinOf(bob, "bob-token", 4_000n, 2_500n),
        coinOf(bob, "bob-bch", 20_000n, 0n),
      ],
    });
    const paid = new Map(settlement.payments.map((payment) => [payment.ownerId, payment.amount]));
    expect(paid.get("chidi")).toBe(4_000n);
    expect(paid.get("daya")).toBe(3_500n);
    const tokenOut = settlement.transaction.outputs.reduce((sum, output) => sum + (output.token?.amount ?? 0n), 0n);
    const tokenIn = settlement.sourceOutputs.reduce((sum, output) => sum + (output.token?.amount ?? 0n), 0n);
    expect(tokenOut).toBe(tokenIn);
    const signed = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys: { ada: ada.privateKey, bob: bob.privateKey },
    });
    expect(verifySettlement(signed, settlement.sourceOutputs)).toBe(true);
    for (const payment of settlement.payments) {
      expect(payment.satoshis).toBeGreaterThanOrEqual(DUST_SATS);
    }
  });
});

function coinOf(
  identity: ReturnType<typeof demoIdentity>,
  label: string,
  satoshis: bigint,
  tokenAmount: bigint,
): SpendableCoin {
  return {
    txid: txid(label),
    vout: 0,
    satoshis,
    lockingBytecode: identity.lockingBytecode,
    tokenAmount,
    tokenCategoryHex: tokenAmount > 0n ? CATEGORY : null,
    ownerId: identity.address.includes(":") ? label.split("-")[0]! : label,
  };
}

describe("settlement guards", () => {
  it("refuses a BCH payment under the dust limit", () => {
    const ada = party("dust-ada");
    const bob = party("dust-bob");
    expect(() =>
      buildSettlement({
        network: "chipnet",
        asset: "bch",
        transfers: [{ fromId: "ada", toId: "bob", amount: 500n }],
        addresses: { ada: ada.address, bob: bob.address },
        coins: [
          {
            txid: txid("dust"),
            vout: 0,
            satoshis: 50_000n,
            lockingBytecode: ada.lockingBytecode,
            tokenAmount: 0n,
            tokenCategoryHex: null,
            ownerId: "ada",
          },
        ],
      }),
    ).toThrow(SettleError);
  });

  it("builds a one-person fallback that the debtor can sign alone", () => {
    const ada = party("fall-ada");
    const chidi = party("fall-chidi");
    const daya = party("fall-daya");
    const settlement = buildSettlement({
      network: "chipnet",
      asset: "bch",
      memo: "Ada alone",
      transfers: [
        { fromId: "ada", toId: "chidi", amount: 30_000n },
        { fromId: "ada", toId: "daya", amount: 20_000n },
      ],
      addresses: { ada: ada.address, chidi: chidi.address, daya: daya.address },
      coins: [
        {
          txid: txid("fall-ada"),
          vout: 1,
          satoshis: 80_000n,
          lockingBytecode: ada.lockingBytecode,
          tokenAmount: 0n,
          tokenCategoryHex: null,
          ownerId: "ada",
        },
      ],
    });
    expect(settlement.inputOwners.every((owner) => owner === "ada")).toBe(true);
    const signed = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys: { ada: ada.privateKey },
    });
    expect(verifySettlement(signed, settlement.sourceOutputs)).toBe(true);
    expect(encodeTransaction(signed).length).toBeGreaterThan(100);
  });
});
