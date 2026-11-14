import { assertInt } from "./money.ts";

export type Balance = {
  id: string;
  cents: number;
};

export type Transfer = {
  fromId: string;
  toId: string;
  amountCents: number;
};

export type NettingResult = {
  transfers: Transfer[];
  /** False when the group was large enough that we used the greedy plan. */
  exact: boolean;
};

const SEARCH_BUDGET = 200_000;

/**
 * Minimum-transfer settlement of integer-cent balances.
 *
 * Balances must sum to zero. Positive means the person is owed money.
 * Payments go only from someone who owes money to someone who is owed money,
 * and nobody is asked to front more than their balance. The search minimizes
 * the number of payments, then picks the lexicographically smallest list.
 * Past the search budget, a deterministic greedy plan is returned and `exact`
 * is false.
 */
export function netBalances(balances: Balance[]): NettingResult {
  let sum = 0;
  for (const balance of balances) {
    assertInt(balance.cents, "Balance");
    sum += balance.cents;
  }
  if (sum !== 0) {
    throw new Error(`Balances must sum to 0 cents before they can be settled (off by ${sum})`);
  }
  const people = balances
    .filter((balance) => balance.cents !== 0)
    .map((balance) => ({ id: balance.id, cents: balance.cents }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (people.length === 0) return { transfers: [], exact: true };

  const debtors = people.filter((person) => person.cents < 0).map((person) => ({ id: person.id, cents: -person.cents }));
  const creditors = people.filter((person) => person.cents > 0).map((person) => ({ id: person.id, cents: person.cents }));
  let best: Transfer[] | null = null;
  let visits = 0;
  let exhausted = false;

  const consider = (transfers: Transfer[]) => {
    const candidate = canonicalize(transfers);
    if (
      !best ||
      candidate.length < best.length ||
      (candidate.length === best.length && lexicographic(candidate, best) < 0)
    ) {
      best = candidate;
    }
  };

  const search = (acc: Transfer[]) => {
    visits += 1;
    if (visits > SEARCH_BUDGET) {
      exhausted = true;
      return;
    }
    const debtor = debtors.find((person) => person.cents > 0);
    if (!debtor) {
      if (creditors.every((person) => person.cents === 0)) consider(acc);
      return;
    }
    if (best && acc.length >= best.length) return;
    for (const creditor of creditors) {
      if (creditor.cents === 0) continue;
      const amount = Math.min(debtor.cents, creditor.cents);
      debtor.cents -= amount;
      creditor.cents -= amount;
      acc.push({ fromId: debtor.id, toId: creditor.id, amountCents: amount });
      search(acc);
      acc.pop();
      debtor.cents += amount;
      creditor.cents += amount;
      if (exhausted) return;
    }
  };

  search([]);
  if (!exhausted && best) return { transfers: best, exact: true };
  return { transfers: greedy(people), exact: false };
}

function greedy(people: { id: string; cents: number }[]): Transfer[] {
  const debtors = people
    .filter((person) => person.cents < 0)
    .map((person) => ({ ...person }))
    .sort((a, b) => a.cents - b.cents || (a.id < b.id ? -1 : 1));
  const creditors = people
    .filter((person) => person.cents > 0)
    .map((person) => ({ ...person }))
    .sort((a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1));
  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!;
    const creditor = creditors[creditorIndex]!;
    const amount = Math.min(-debtor.cents, creditor.cents);
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents: amount });
    debtor.cents += amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) debtorIndex += 1;
    if (creditor.cents === 0) creditorIndex += 1;
  }
  return canonicalize(transfers);
}

function canonicalize(transfers: Transfer[]): Transfer[] {
  return [...transfers].sort((a, b) => {
    if (a.fromId !== b.fromId) return a.fromId < b.fromId ? -1 : 1;
    if (a.toId !== b.toId) return a.toId < b.toId ? -1 : 1;
    return a.amountCents - b.amountCents;
  });
}

function lexicographic(left: Transfer[], right: Transfer[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (a.fromId !== b.fromId) return a.fromId < b.fromId ? -1 : 1;
    if (a.toId !== b.toId) return a.toId < b.toId ? -1 : 1;
    if (a.amountCents !== b.amountCents) return a.amountCents - b.amountCents;
  }
  return left.length - right.length;
}

/** Apply transfers and return the resulting cent balances, keyed by id. */
export function applyTransfers(balances: Balance[], transfers: Transfer[]): Map<string, number> {
  const next = new Map(balances.map((balance) => [balance.id, balance.cents]));
  for (const transfer of transfers) {
    next.set(transfer.fromId, (next.get(transfer.fromId) ?? 0) + transfer.amountCents);
    next.set(transfer.toId, (next.get(transfer.toId) ?? 0) - transfer.amountCents);
  }
  return next;
}
