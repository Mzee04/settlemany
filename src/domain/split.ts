import { assertInt } from "./money.ts";

export type SplitMode = "equal" | "shares" | "amounts" | "percent";

export type SplitPart = {
  memberId: string;
  /** Included in equal / shares / percent. Amounts mode uses amountCents. */
  shares?: number;
  amountCents?: number;
  /** Basis points. 10000 = 100%. */
  percentBps?: number;
};

export type Share = {
  memberId: string;
  cents: number;
};

/**
 * Divide an integer total. Floors first, then gives leftover cents to the
 * largest fractional remainders. Ties break toward the smaller member id.
 */
export function allocateCents(totalCents: number, weights: { memberId: string; weight: number }[]): Share[] {
  assertInt(totalCents, "Amount");
  if (totalCents < 0) throw new Error("Amount must be zero or positive");
  if (weights.length === 0) {
    if (totalCents === 0) return [];
    throw new Error("Choose at least one person to share this expense");
  }
  for (const weight of weights) {
    if (!Number.isFinite(weight.weight) || weight.weight < 0) {
      throw new Error("Shares must be zero or positive");
    }
  }
  const sum = weights.reduce((total, weight) => total + weight.weight, 0);
  if (sum <= 0) throw new Error("The shares have to add up to more than zero");
  const rows = weights.map((weight) => {
    const exact = (totalCents * weight.weight) / sum;
    const cents = Math.floor(exact);
    return { memberId: weight.memberId, cents, fraction: exact - cents };
  });
  let remainder = totalCents - rows.reduce((total, row) => total + row.cents, 0);
  const order = [...rows].sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
  for (let index = 0; index < remainder; index += 1) {
    order[index % order.length]!.cents += 1;
  }
  remainder = totalCents - rows.reduce((total, row) => total + row.cents, 0);
  if (remainder !== 0) throw new Error("Split remainder was not assigned");
  return weights.map((weight) => {
    const row = rows.find((candidate) => candidate.memberId === weight.memberId);
    if (!row) throw new Error("Missing split row");
    return { memberId: row.memberId, cents: row.cents };
  });
}

export function splitExpense(totalCents: number, mode: SplitMode, parts: SplitPart[]): Share[] {
  assertInt(totalCents, "Amount");
  if (mode === "amounts") {
    for (const part of parts) {
      assertInt(part.amountCents ?? 0, "Exact amount");
      if ((part.amountCents ?? 0) < 0) throw new Error("Exact amounts cannot be negative");
    }
    const sum = parts.reduce((total, part) => total + (part.amountCents ?? 0), 0);
    if (sum !== totalCents) {
      throw new Error(`Exact amounts add up to ${(sum / 100).toFixed(2)}, not ${(totalCents / 100).toFixed(2)}`);
    }
    return parts.map((part) => ({ memberId: part.memberId, cents: part.amountCents ?? 0 }));
  }
  if (mode === "percent") {
    for (const part of parts) assertInt(part.percentBps ?? 0, "Percent");
    const sum = parts.reduce((total, part) => total + (part.percentBps ?? 0), 0);
    if (sum !== 10_000) throw new Error("Percents must add up to 100%");
    return allocateCents(
      totalCents,
      parts
        .filter((part) => (part.percentBps ?? 0) > 0)
        .map((part) => ({ memberId: part.memberId, weight: part.percentBps ?? 0 })),
    );
  }
  if (mode === "shares") {
    for (const part of parts) assertInt(part.shares ?? 0, "Shares");
    return allocateCents(
      totalCents,
      parts
        .filter((part) => (part.shares ?? 0) > 0)
        .map((part) => ({ memberId: part.memberId, weight: part.shares ?? 0 })),
    );
  }
  return allocateCents(
    totalCents,
    parts.map((part) => ({ memberId: part.memberId, weight: 1 })),
  );
}
