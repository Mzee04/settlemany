import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload } from "../chain/envelope.ts";
import { serializeTemplate } from "@xo-cash/utils";
import {
  SETTLE_GROUP_ACTION,
  SPEND_RECEIVED_ACTION,
  settlemanyTemplate,
} from "./settlemanyTemplate.ts";

describe("XO settlement template", () => {
  it("parses as an XO template and names the all-input sighash", () => {
    expect(settlemanyTemplate.name).toBe("Settlemany group settlement");
    expect(settlemanyTemplate.actions[SETTLE_GROUP_ACTION]?.transaction).toBe("groupSettlementTransaction");
    expect(settlemanyTemplate.scripts?.unlockDebtorInput).toContain("all_outputs_all_utxos");
    expect(settlemanyTemplate.scripts?.unlockReceivedSettlement).toContain("all_outputs_all_utxos");
    const followUp = settlemanyTemplate.lockingScripts?.receivedSettlement?.roles?.creditor?.actions ?? [];
    expect(followUp.map((intent) => intent.action)).toContain(SPEND_RECEIVED_ACTION);
    expect(settlemanyTemplate.actions[SPEND_RECEIVED_ACTION]?.transaction).toBe("spendReceivedTransaction");
    const debtor = settlemanyTemplate.actions[SETTLE_GROUP_ACTION]?.requirements?.participants?.find(
      (slot) => slot.role === "debtor",
    );
    expect(debtor?.slots.min).toBe(0);
    expect(debtor?.slots.max).toBeUndefined();
    expect(serializeTemplate(settlemanyTemplate)).toContain("settleGroup");
  });
});

describe("shareable payloads", () => {
  it("round-trips unicode through the URL encoding", () => {
    const original = { memo: "Suya — ₦", n: 10 };
    expect(decodePayload<typeof original>(encodePayload(original))).toEqual(original);
  });
});
