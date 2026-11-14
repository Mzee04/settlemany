import { netBalances, type Transfer } from "./netting.ts";
import { splitExpense, type SplitMode, type SplitPart } from "./split.ts";

export type Member = {
  id: string;
  name: string;
  address: string;
  /** Set only for the public demo group. Never a real secret. */
  demoKeyLabel: string | null;
};

export type Expense = {
  id: string;
  memo: string;
  payerId: string;
  /** Minor units of `currency`. */
  amountCents: number;
  currency: string;
  /** Snapshot in USD cents so later FX moves do not rewrite history. */
  usdCents: number;
  fxNote: string;
  splitMode: SplitMode;
  parts: SplitPart[];
  createdAt: string;
};

export type SettledLeg = {
  id: string;
  fromId: string;
  toId: string;
  usdCents: number;
  txid: string | null;
  asset: "bch" | "pusd";
  network: "chipnet" | "mainnet";
  demo: boolean;
  memo: string;
  createdAt: string;
};

export type Group = {
  id: string;
  name: string;
  story: string;
  createdAt: string;
  members: Member[];
  expenses: Expense[];
  settled: SettledLeg[];
};

export type LedgerBalance = {
  memberId: string;
  name: string;
  cents: number;
};

export function expenseShares(expense: Expense): { memberId: string; cents: number }[] {
  const currencyShares = splitExpense(expense.amountCents, expense.splitMode, expense.parts);
  if (expense.usdCents === expense.amountCents) return currencyShares;
  return splitExpense(
    expense.usdCents,
    "shares",
    currencyShares.map((share) => ({ memberId: share.memberId, shares: share.cents })),
  );
}

export function rawBalances(group: Group): LedgerBalance[] {
  const totals = new Map(group.members.map((member) => [member.id, 0]));
  for (const expense of group.expenses) {
    totals.set(expense.payerId, (totals.get(expense.payerId) ?? 0) + expense.usdCents);
    for (const share of expenseShares(expense)) {
      totals.set(share.memberId, (totals.get(share.memberId) ?? 0) - share.cents);
    }
  }
  for (const leg of group.settled) {
    if (leg.demo) continue;
    totals.set(leg.fromId, (totals.get(leg.fromId) ?? 0) + leg.usdCents);
    totals.set(leg.toId, (totals.get(leg.toId) ?? 0) - leg.usdCents);
  }
  return group.members.map((member) => ({
    memberId: member.id,
    name: member.name,
    cents: totals.get(member.id) ?? 0,
  }));
}

export function openTransfers(group: Group): { transfers: Transfer[]; exact: boolean } {
  const result = netBalances(rawBalances(group).map((balance) => ({ id: balance.memberId, cents: balance.cents })));
  return result;
}

export function memberName(group: Group, memberId: string): string {
  return group.members.find((member) => member.id === memberId)?.name ?? "Someone";
}
