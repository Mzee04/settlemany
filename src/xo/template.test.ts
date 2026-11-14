import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload } from "../chain/envelope.ts";
import { settlemanyTemplate } from "./settlemanyTemplate.ts";

describe("XO settlement template", () => {
  it("describes one multi-signer settlement and a creditor follow-up", () => {
    expect(settlemanyTemplate.name).toBe("Settlemany group settlement");
    expect(settlemanyTemplate.scripts.unlockP2PKH).toContain("all_outputs_all_utxos");
    const settle = settlemanyTemplate.actions.settleGroup;
    expect(settle?.transaction).toBe("groupSettlement");
    expect(settle?.requirements?.participants).toEqual([
      { role: "clerk", slots: { min: 1, max: 1 } },
      { role: "debtor", slots: { min: 1 } },
    ]);
    expect(settlemanyTemplate.transactions?.groupSettlement?.version).toBe(2);
    expect(settlemanyTemplate.transactions?.groupSettlement?.inputs).toEqual([{ input: "debtorInput" }]);
    const followUps = settlemanyTemplate.lockingScripts.payeeLock?.actions ?? [];
    expect(followUps.map((intent) => intent.action)).toContain("spendReceivedShare");
    expect(settlemanyTemplate.actions.spendReceivedShare?.transaction).toBe("spendReceived");
    expect(settlemanyTemplate.start[0]).toMatchObject({ action: "settleGroup", role: "clerk" });
  });
});

describe("shareable payloads", () => {
  it("round-trips unicode through the URL encoding", () => {
    const original = { memo: "Suya — ₦", n: 10 };
    expect(decodePayload<typeof original>(encodePayload(original))).toEqual(original);
  });
});
