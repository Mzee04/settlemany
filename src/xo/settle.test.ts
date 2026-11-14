import { sha256 } from "@bitauth/libauth";
import { describe, expect, it } from "vitest";
import { demoIdentity } from "../chain/address.ts";
import { decodePayload, encodePayload } from "../chain/envelope.ts";
import { settlementToPacket, type SigningPacket } from "../chain/packet.ts";
import { buildSettlement, transactionHex, type BuiltSettlement, type SpendableCoin } from "../chain/settle.ts";
import { signOwners, transactionId, verifySettlement } from "../chain/sign.ts";
import {
  applyWalletUnlocks,
  compileSettlementInvitation,
  invitationTransaction,
  recordInvitationResult,
} from "./settleInvitation.ts";
import { generateTemplateIdentifier } from "@xo-cash/utils";
import { SETTLEMANY_TEMPLATE_IDENTIFIER, settlemanyTemplate } from "./settlemanyTemplate.ts";

/** Public BIP39 test vector. It only signs invitation commits in these tests. */
const COORDINATOR = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
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
  return [...sha256.hash(new TextEncoder().encode(label))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("XO group settlement", () => {
  const ada = demoIdentity("ada");
  const bob = demoIdentity("bob");
  const chidi = demoIdentity("chidi");
  const daya = demoIdentity("daya");
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
  const coins = [coin("ada", "ada-utxo", 200_000n), coin("bob", "bob-utxo", 150_000n)];
  const keys = { ada: ada.privateKey, bob: bob.privateKey };

  function built(network: "chipnet" | "mainnet" = "chipnet") {
    return buildSettlement({
      network,
      asset: "bch",
      transfers,
      addresses,
      coins,
      memo: "Eko weekend",
    });
  }

  it("encodes the same transaction as the classic builder and keeps a valid invitation", () => {
    const settlement = built();
    const compiled = compileSettlementInvitation({
      built: settlement,
      network: "chipnet",
      memo: "Eko weekend",
      coordinationMnemonic: COORDINATOR,
    });
    expect(compiled.templateIdentifier).toBe(SETTLEMANY_TEMPLATE_IDENTIFIER);
    expect(invitationTransaction(compiled.invitation)).toEqual(settlement.transaction);
    const signed = signOwners({
      transaction: settlement.transaction,
      sourceOutputs: settlement.sourceOutputs,
      inputOwners: settlement.inputOwners,
      keys,
    });
    expect(verifySettlement(signed, settlement.sourceOutputs)).toBe(true);
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
    expect(transactionId(adaFirst)).toBe(transactionId(bobFirst));
    expect(verifySettlement(adaFirst, settlement.sourceOutputs)).toBe(true);
    expect(verifySettlement(bobFirst, settlement.sourceOutputs)).toBe(true);
    const withUnlocks = applyWalletUnlocks({
      invitation: compiled.invitation,
      transaction: signed,
      network: "chipnet",
      coordinationMnemonic: COORDINATOR,
    });
    expect(withUnlocks).not.toBe(compiled.invitation);
    const recorded = recordInvitationResult({
      invitation: withUnlocks,
      network: "chipnet",
      coordinationMnemonic: COORDINATOR,
      broadcasted: true,
    });
    expect(recorded).toContain("groupSettlementTransaction");
    const ignored = applyWalletUnlocks({
      invitation: compiled.invitation,
      transaction: signed,
      network: "chipnet",
      coordinationMnemonic:
        "legal winner thank year wave sausage worth useful legal winner thank yellow",
    });
    expect(ignored).toBe(compiled.invitation);
  });

  it("uses a mainnet entity identifier on mainnet", () => {
    const settlement = buildSettlement({
      network: "mainnet",
      asset: "bch",
      transfers,
      addresses: {
        ada: demoIdentity("ada", "mainnet").address,
        bob: demoIdentity("bob", "mainnet").address,
        chidi: demoIdentity("chidi", "mainnet").address,
        daya: demoIdentity("daya", "mainnet").address,
      },
      coins: [
        { ...coin("ada", "ada-main", 200_000n), lockingBytecode: demoIdentity("ada", "mainnet").lockingBytecode },
        { ...coin("bob", "bob-main", 150_000n), lockingBytecode: demoIdentity("bob", "mainnet").lockingBytecode },
      ],
      memo: "mainnet",
    });
    const compiled = compileSettlementInvitation({
      built: settlement,
      network: "mainnet",
      memo: "mainnet",
      coordinationMnemonic: COORDINATOR,
    });
    expect(compiled.invitation).toContain("xpub");
    expect(compiled.invitation).not.toContain("tpub");
  });

  it("covers a fungible token settlement", () => {
    const settlement = buildSettlement({
      network: "chipnet",
      asset: "pusd",
      tokenCategoryHex: CATEGORY,
      transfers: [{ fromId: "ada", toId: "chidi", amount: 250n }],
      addresses,
      coins: [coin("ada", "ada-token", 20_000n, 400n), coin("ada", "ada-fee", 20_000n)],
      memo: "token",
    });
    const compiled = compileSettlementInvitation({
      built: settlement,
      network: "chipnet",
      memo: "token",
      coordinationMnemonic: COORDINATOR,
    });
    expect(invitationTransaction(compiled.invitation).outputs.some((output) => output.token?.amount === 250n)).toBe(true);
  });

  it("round-trips a signing link when satoshi amounts were stored as decimal strings", () => {
    const cases: { network: "mainnet" | "chipnet"; settlement: BuiltSettlement; memo: string }[] = [
      {
        network: "mainnet",
        memo: "one debtor",
        settlement: buildSettlement({
          network: "mainnet",
          asset: "bch",
          transfers: [{ fromId: "ada", toId: "chidi", amount: 8_000n }],
          addresses: {
            ada: demoIdentity("ada", "mainnet").address,
            chidi: demoIdentity("chidi", "mainnet").address,
          },
          coins: [
            {
              ...coin("ada", "ada-link", 50_000n),
              lockingBytecode: demoIdentity("ada", "mainnet").lockingBytecode,
            },
          ],
          memo: "one debtor",
        }),
      },
      {
        network: "chipnet",
        memo: "token",
        settlement: buildSettlement({
          network: "chipnet",
          asset: "pusd",
          tokenCategoryHex: CATEGORY,
          transfers: [{ fromId: "ada", toId: "chidi", amount: 250n }],
          addresses,
          coins: [coin("ada", "ada-link-token", 20_000n, 400n), coin("ada", "ada-link-fee", 20_000n)],
          memo: "token",
        }),
      },
    ];

    for (const item of cases) {
      const compiled = compileSettlementInvitation({
        built: item.settlement,
        network: item.network,
        memo: item.memo,
        coordinationMnemonic: COORDINATOR,
      });
      const flattened = compiled.invitation.replace(/"<bigint: (-?\d+)n>"/g, '"$1"');
      expect(flattened).not.toContain("<bigint:");
      const packet = linkPacket(item.settlement, item.network, flattened);
      const opened = decodePayload<SigningPacket>(encodePayload(packet));
      const signed = signOwners({
        transaction: item.settlement.transaction,
        sourceOutputs: item.settlement.sourceOutputs,
        inputOwners: item.settlement.inputOwners,
        keys: { ada: demoIdentity("ada", item.network).privateKey },
      });
      const withUnlocks = applyWalletUnlocks({
        invitation: opened.xoInvitation ?? "",
        transaction: signed,
        network: item.network,
        coordinationMnemonic: COORDINATOR,
      });
      expect(withUnlocks).toContain("<bigint:");
      const updated = decodePayload<SigningPacket>(
        encodePayload({ ...opened, txHex: transactionHex(signed), xoInvitation: withUnlocks }),
      );
      const recorded = recordInvitationResult({
        invitation: updated.xoInvitation ?? "",
        network: item.network,
        coordinationMnemonic: COORDINATOR,
        broadcasted: true,
      });
      const receipt = decodePayload<{ xoInvitation: string }>(encodePayload({ xoInvitation: recorded }));
      const again = invitationTransaction(receipt.xoInvitation);
      expect(again.outputs.some((output) => typeof output.valueSatoshis === "bigint")).toBe(true);
      if (item.settlement.transaction.outputs.some((output) => output.token)) {
        expect(again.outputs.some((output) => output.token?.amount === 250n)).toBe(true);
      }
    }
  });
});

it("builds a mainnet one-debtor signing link while BigInt JSON is patched", () => {
    const proto = BigInt.prototype as unknown as { toJSON?: () => string };
    const previous = proto.toJSON;
    proto.toJSON = function decimalBigInt(this: bigint) {
      return this.toString();
    };
    try {
      const hostileHash = generateTemplateIdentifier(settlemanyTemplate);
      expect(hostileHash).toBe("9416937b911cc1915c2a632ff16c650958f56f14590a2898869680bff7f8d282");
      expect(SETTLEMANY_TEMPLATE_IDENTIFIER).toBe("56e21b56140e309a9b3276dd42f5054ff984b3c95351c64af36f5f07fc585a99");
      expect(hostileHash).not.toBe(SETTLEMANY_TEMPLATE_IDENTIFIER);
      const me = demoIdentity("me", "mainnet");
      const goodness = demoIdentity("goodness", "mainnet");
      const settlement = buildSettlement({
        network: "mainnet",
        asset: "bch",
        transfers: [{ fromId: "me", toId: "goodness", amount: 5016n }],
        addresses: { me: me.address, goodness: goodness.address },
        coins: [{
          txid: txid("happiness"),
          vout: 0,
          satoshis: 20_000n,
          lockingBytecode: me.lockingBytecode,
          tokenAmount: 0n,
          tokenCategoryHex: null,
          ownerId: "me",
        }],
        memo: "happiness",
      });
      const compiled = compileSettlementInvitation({
        built: settlement,
        network: "mainnet",
        memo: "happiness",
        coordinationMnemonic: COORDINATOR,
      });
      expect(compiled.templateIdentifier).toBe(SETTLEMANY_TEMPLATE_IDENTIFIER);
      expect(compiled.invitation).toContain(SETTLEMANY_TEMPLATE_IDENTIFIER);
      const packet = linkPacket(settlement, "mainnet", compiled.invitation);
      const opened = decodePayload<SigningPacket>(encodePayload(packet));
      const signed = signOwners({
        transaction: settlement.transaction,
        sourceOutputs: settlement.sourceOutputs,
        inputOwners: settlement.inputOwners,
        keys: { me: me.privateKey },
      });
      const withUnlocks = applyWalletUnlocks({
        invitation: opened.xoInvitation ?? "",
        transaction: signed,
        network: "mainnet",
        coordinationMnemonic: COORDINATOR,
      });
      const recorded = recordInvitationResult({
        invitation: withUnlocks,
        network: "mainnet",
        coordinationMnemonic: COORDINATOR,
        broadcasted: false,
      });
      expect(invitationTransaction(recorded).outputs[0]?.valueSatoshis).toBe(5016n);
      expect(Object.isFrozen(settlemanyTemplate)).toBe(true);
      expect(typeof settlemanyTemplate.outputs.settlementMemo?.valueSatoshis).toBe("bigint");
    } finally {
      if (previous === undefined) delete proto.toJSON;
      else proto.toJSON = previous;
    }
  });

function linkPacket(settlement: BuiltSettlement, network: "mainnet" | "chipnet", invitation: string): SigningPacket {
  return settlementToPacket({
    built: settlement,
    names: { ada: "Ada", chidi: "Chidi" },
    groupId: "group",
    groupName: "Group",
    network,
    asset: settlement.transaction.outputs.some((output) => output.token) ? "pusd" : "bch",
    tokenCategoryHex: settlement.transaction.outputs.some((output) => output.token) ? CATEGORY : null,
    memo: "link",
    legs: [],
    addresses: {},
    demo: false,
    builder: "xo",
    xoInvitation: invitation,
  });
}
