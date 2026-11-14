import { p2pkhTemplate } from "@xo-cash/templates";
import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload } from "../chain/envelope.ts";
import { settlemanyTemplate } from "./settlemanyTemplate.ts";

describe("XO settlement template", () => {
  it("matches the current XO template shape and commits signatures to every input", () => {
    expect(Object.keys(settlemanyTemplate).sort()).toEqual(Object.keys(p2pkhTemplate).sort());
    const scripts = settlemanyTemplate.scripts as { unlockP2PKH: string };
    expect(scripts.unlockP2PKH).toContain("all_outputs_all_utxos");
    const actions = settlemanyTemplate.actions as Record<string, { name: string; transaction?: string }>;
    expect(actions.settleSatoshis?.name).toMatch(/Bitcoin Cash/);
    expect(actions.settleFungibleTokens?.name).toMatch(/CashToken/);
    const transactions = settlemanyTemplate.transactions as Record<string, unknown>;
    expect(transactions[actions.settleSatoshis?.transaction ?? ""]).toBeTruthy();
    expect(JSON.parse(JSON.stringify(settlemanyTemplate)).name).toBe("Settlemany settlement");
  });
});

describe("shareable payloads", () => {
  it("round-trips unicode through the URL encoding", () => {
    const original = { memo: "Suya — ₦", n: 10 };
    expect(decodePayload<typeof original>(encodePayload(original))).toEqual(original);
  });
});