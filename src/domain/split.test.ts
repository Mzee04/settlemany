import { describe, expect, it } from "vitest";
import { foreignMinorToUsdCents, rateToE8 } from "./price.ts";
import { usdCentsToSats } from "./money.ts";
import { splitExpense } from "./split.ts";
import { expenseShares, rawBalances, type Group } from "./ledger.ts";

describe("splits", () => {
  it("gives leftover cents to the earliest id when fractions tie", () => {
    const shares = splitExpense(100, "equal", [
      { memberId: "b" },
      { memberId: "a" },
      { memberId: "c" },
    ]);
    expect(shares).toEqual([
      { memberId: "b", cents: 33 },
      { memberId: "a", cents: 34 },
      { memberId: "c", cents: 33 },
    ]);
    expect(shares.reduce((sum, share) => sum + share.cents, 0)).toBe(100);
  });

  it("honors integer shares and exact amounts", () => {
    expect(
      splitExpense(100, "shares", [
        { memberId: "a", shares: 1 },
        { memberId: "b", shares: 2 },
        { memberId: "c", shares: 1 },
      ]),
    ).toEqual([
      { memberId: "a", cents: 25 },
      { memberId: "b", cents: 50 },
      { memberId: "c", cents: 25 },
    ]);
    expect(
      splitExpense(7450, "amounts", [
        { memberId: "a", amountCents: 2980 },
        { memberId: "b", amountCents: 2980 },
        { memberId: "c", amountCents: 1490 },
        { memberId: "d", amountCents: 0 },
      ]),
    ).toHaveLength(4);
  });

  it("requires percents to sum to 100%", () => {
    expect(() =>
      splitExpense(2240, "percent", [
        { memberId: "a", percentBps: 4000 },
        { memberId: "b", percentBps: 2000 },
      ]),
    ).toThrow(/100%/);
    expect(
      splitExpense(2240, "percent", [
        { memberId: "a", percentBps: 4000 },
        { memberId: "b", percentBps: 2000 },
        { memberId: "c", percentBps: 2000 },
        { memberId: "d", percentBps: 2000 },
      ]).map((share) => share.cents),
    ).toEqual([896, 448, 448, 448]);
  });
});

describe("money conversion", () => {
  it("rounds USD to satoshis half-up without floats", () => {
    expect(usdCentsToSats(100, 45_000)).toBe(222_222n);
    expect(usdCentsToSats(10, 45_000)).toBe(22_222n);
  });

  it("converts a two-decimal foreign amount into USD cents", () => {
    const rate = rateToE8(1500);
    expect(foreignMinorToUsdCents(150_000, rate)).toBe(100);
  });
});

describe("group ledger", () => {
  it("nets the Eko weekend demo to three payments toward Adaeze", () => {
    const group: Group = {
      id: "g",
      name: "Eko",
      story: "",
      createdAt: "",
      settled: [],
      members: [
        { id: "ada", name: "Adaeze", address: "", demoKeyLabel: null },
        { id: "chinedu", name: "Chinedu", address: "", demoKeyLabel: null },
        { id: "bisi", name: "Bisi", address: "", demoKeyLabel: null },
        { id: "emeka", name: "Emeka", address: "", demoKeyLabel: null },
      ],
      expenses: [
        expense("apt", "ada", 18600, "equal", ["ada", "chinedu", "bisi", "emeka"]),
        {
          id: "dinner",
          memo: "Dinner",
          payerId: "chinedu",
          amountCents: 7450,
          currency: "USD",
          usdCents: 7450,
          fxNote: "USD",
          splitMode: "shares",
          parts: [
            { memberId: "ada", shares: 2 },
            { memberId: "chinedu", shares: 2 },
            { memberId: "bisi", shares: 1 },
            { memberId: "emeka", shares: 0 },
          ],
          createdAt: "",
        },
        expense("boat", "bisi", 3600, "equal", ["ada", "chinedu", "bisi", "emeka"]),
        {
          id: "suya",
          memo: "Suya",
          payerId: "emeka",
          amountCents: 2240,
          currency: "USD",
          usdCents: 2240,
          fxNote: "USD",
          splitMode: "percent",
          parts: [
            { memberId: "ada", percentBps: 4000 },
            { memberId: "chinedu", percentBps: 2000 },
            { memberId: "bisi", percentBps: 2000 },
            { memberId: "emeka", percentBps: 2000 },
          ],
          createdAt: "",
        },
      ],
    };
    const balances = new Map(rawBalances(group).map((balance) => [balance.memberId, balance.cents]));
    expect(balances.get("ada")).toBe(9174);
    expect(balances.get("chinedu")).toBe(-1528);
    expect(balances.get("bisi")).toBe(-3888);
    expect(balances.get("emeka")).toBe(-3758);
    expect([...balances.values()].reduce((sum, cents) => sum + cents, 0)).toBe(0);
    const dinner = group.expenses[1]!;
    expect(expenseShares(dinner).map((share) => share.cents)).toEqual([2980, 2980, 1490]);
  });
});

function expense(id: string, payerId: string, cents: number, mode: "equal", members: string[]) {
  return {
    id,
    memo: id,
    payerId,
    amountCents: cents,
    currency: "USD",
    usdCents: cents,
    fxNote: "USD",
    splitMode: mode,
    parts: members.map((memberId) => ({ memberId })),
    createdAt: "",
  };
}
