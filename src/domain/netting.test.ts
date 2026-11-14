import { describe, expect, it } from "vitest";
import { applyTransfers, netBalances, type Balance } from "./netting.ts";

function settled(balances: Balance[]) {
  const result = netBalances(balances);
  const after = applyTransfers(balances, result.transfers);
  return { ...result, after };
}

describe("minimal transfers", () => {
  it("drops a cycle that already nets to zero", () => {
    const balances = [
      { id: "ada", cents: 0 },
      { id: "bob", cents: 0 },
      { id: "chi", cents: 0 },
    ];
    expect(netBalances(balances).transfers).toEqual([]);
  });

  it("matches the classic one-payment reduction", () => {
    const result = settled([
      { id: "p0", cents: -4 },
      { id: "p1", cents: 4 },
      { id: "p2", cents: 0 },
    ]);
    expect(result.exact).toBe(true);
    expect(result.transfers).toEqual([{ fromId: "p0", toId: "p1", amountCents: 4 }]);
    expect([...result.after.values()].every((cents) => cents === 0)).toBe(true);
  });

  it("needs two payments when two people owe one creditor", () => {
    const result = settled([
      { id: "p0", cents: -5 },
      { id: "p1", cents: 10 },
      { id: "p2", cents: -5 },
    ]);
    expect(result.transfers).toHaveLength(2);
    expect([...result.after.values()].every((cents) => cents === 0)).toBe(true);
  });

  it("is deterministic regardless of input order", () => {
    const first = netBalances([
      { id: "bisi", cents: -3888 },
      { id: "ada", cents: 9174 },
      { id: "emeka", cents: -3758 },
      { id: "chinedu", cents: -1528 },
    ]);
    const second = netBalances([
      { id: "emeka", cents: -3758 },
      { id: "chinedu", cents: -1528 },
      { id: "ada", cents: 9174 },
      { id: "bisi", cents: -3888 },
    ]);
    expect(second.transfers).toEqual(first.transfers);
    expect(first.exact).toBe(true);
    expect(first.transfers).toHaveLength(3);
    const netToAda = first.transfers
      .filter((transfer) => transfer.toId === "ada")
      .reduce((sum, transfer) => sum + transfer.amountCents, 0);
    const netFromAda = first.transfers
      .filter((transfer) => transfer.fromId === "ada")
      .reduce((sum, transfer) => sum + transfer.amountCents, 0);
    expect(netToAda - netFromAda).toBe(9174);
    expect(first.transfers).toEqual([
      { fromId: "bisi", toId: "ada", amountCents: 3888 },
      { fromId: "chinedu", toId: "ada", amountCents: 1528 },
      { fromId: "emeka", toId: "ada", amountCents: 3758 },
    ]);
  });

  it("refuses a ledger that does not balance", () => {
    expect(() => netBalances([{ id: "ada", cents: 10 }, { id: "bob", cents: -3 }])).toThrow(/sum to 0/);
  });
});
