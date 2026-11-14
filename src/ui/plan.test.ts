import { describe, expect, it } from "vitest";
import { addressNetwork } from "../chain/address.ts";
import { buildSettlement } from "../chain/settle.ts";
import { signOwners, verifySettlement } from "../chain/sign.ts";
import { createDemoGroup } from "../domain/demo.ts";
import { openTransfers } from "../domain/ledger.ts";
import { chainAmount, demoKeys, pretendCoins, DEMO_TOKEN_CATEGORY } from "./plan.ts";

describe("demo click-through", () => {
  it("signs the preseeded weekend in one BCH transaction that the VM accepts", () => {
    const group = createDemoGroup();
    const { transfers } = openTransfers(group);
    expect(transfers).toHaveLength(3);
    const keys = demoKeys(group);
    const network = addressNetwork(group.members[0]!.address);
    expect(network).toBe("chipnet");
    const built = buildSettlement({
      network,
      asset: "bch",
      memo: group.name,
      transfers: transfers.map((transfer) => ({
        fromId: transfer.fromId,
        toId: transfer.toId,
        amount: chainAmount(transfer.amountCents, "bch", 45_000),
      })),
      addresses: Object.fromEntries(group.members.map((member) => [member.id, member.address])),
      coins: pretendCoins({
        group,
        transfers,
        asset: "bch",
        network,
        categoryHex: DEMO_TOKEN_CATEGORY,
        priceCents: 45_000,
      }),
    });
    const signed = signOwners({
      transaction: built.transaction,
      sourceOutputs: built.sourceOutputs,
      inputOwners: built.inputOwners,
      keys,
    });
    expect(verifySettlement(signed, built.sourceOutputs)).toBe(true);
    const paid = built.payments.reduce((sum, payment) => sum + payment.amount, 0n);
    const expected = transfers.reduce((sum, transfer) => sum + chainAmount(transfer.amountCents, "bch", 45_000), 0n);
    expect(paid).toBe(expected);
    expect(built.payments).toHaveLength(1);
  });
});
