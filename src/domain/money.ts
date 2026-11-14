/** Integer cents and satoshis. No floating point in the ledger. */

export function assertInt(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${whole.toLocaleString("en-US")}.${frac}`;
}

export function formatBch(sats: bigint): string {
  const sign = sats < 0n ? "−" : "";
  const abs = sats < 0n ? -sats : sats;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${sign}${whole.toString()}.${frac || "0"} BCH`;
}

export function formatToken(units: bigint, symbol: string, decimals = 2): string {
  const sign = units < 0n ? "−" : "";
  const abs = units < 0n ? -units : units;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0");
  return `${sign}${whole.toString()}.${frac} ${symbol}`;
}

/**
 * Split `total` across positive weights. Remainder units go to the
 * lexicographically smallest ids, one each, so the result is exact and stable.
 */
export function allocateBigint(
  total: bigint,
  parts: { id: string; weight: bigint }[],
): { id: string; amount: bigint }[] {
  if (total < 0n) throw new Error("Cannot allocate a negative total");
  if (parts.length === 0) {
    if (total === 0n) return [];
    throw new Error("Nothing to allocate across");
  }
  const usable = parts.map((part) => ({
    id: part.id,
    weight: part.weight > 0n ? part.weight : 0n,
  }));
  const weight = usable.reduce((sum, part) => sum + part.weight, 0n);
  const effective = weight === 0n ? usable.map((part) => ({ ...part, weight: 1n })) : usable;
  const sumWeight = effective.reduce((sum, part) => sum + part.weight, 0n);
  const rows = effective.map((part) => ({
    id: part.id,
    amount: (total * part.weight) / sumWeight,
  }));
  let remainder = total - rows.reduce((sum, row) => sum + row.amount, 0n);
  const order = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of order) {
    if (remainder === 0n) break;
    row.amount += 1n;
    remainder -= 1n;
  }
  if (remainder !== 0n) throw new Error("Allocation did not consume the total");
  return parts.map((part) => {
    const row = rows.find((candidate) => candidate.id === part.id);
    if (!row) throw new Error("Missing allocation row");
    return row;
  });
}

/**
 * Convert USD cents to satoshis at an integer price (USD cents per 1 BCH).
 * Half-up rounding, deterministic.
 */
export function usdCentsToSats(usdCents: number, usdCentsPerBch: number): bigint {
  assertInt(usdCents, "USD cents");
  assertInt(usdCentsPerBch, "BCH price");
  if (usdCents < 0) throw new Error("USD cents must be positive");
  if (usdCentsPerBch <= 0) throw new Error("BCH price must be positive");
  const amount = BigInt(usdCents) * 100_000_000n;
  const price = BigInt(usdCentsPerBch);
  return (amount + price / 2n) / price;
}

export function satsToUsdCents(sats: bigint, usdCentsPerBch: number): number {
  assertInt(usdCentsPerBch, "BCH price");
  if (usdCentsPerBch <= 0) throw new Error("BCH price must be positive");
  const price = BigInt(usdCentsPerBch);
  const cents = (sats * price + 50_000_000n) / 100_000_000n;
  return Number(cents);
}
