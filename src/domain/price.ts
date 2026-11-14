import { assertInt } from "./money.ts";

export const CURRENCIES = [
  { code: "USD", label: "US dollar", decimals: 2 },
  { code: "EUR", label: "Euro", decimals: 2 },
  { code: "GBP", label: "British pound", decimals: 2 },
  { code: "NGN", label: "Nigerian naira", decimals: 2 },
  { code: "GHS", label: "Ghanaian cedi", decimals: 2 },
  { code: "KES", label: "Kenyan shilling", decimals: 2 },
  { code: "ZAR", label: "South African rand", decimals: 2 },
  { code: "CAD", label: "Canadian dollar", decimals: 2 },
  { code: "AUD", label: "Australian dollar", decimals: 2 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

/**
 * Convert a foreign minor-unit amount into USD cents.
 * `foreignPerUsdE8` is the FX rate times 1e8 (foreign major units per 1 USD).
 */
export function foreignMinorToUsdCents(minor: number, foreignPerUsdE8: number): number {
  assertInt(minor, "Amount");
  assertInt(foreignPerUsdE8, "Exchange rate");
  if (minor < 0) throw new Error("Amount must be positive");
  if (foreignPerUsdE8 <= 0) throw new Error("Exchange rate must be positive");
  const usd = (BigInt(minor) * 100_000_000n + BigInt(foreignPerUsdE8) / 2n) / BigInt(foreignPerUsdE8);
  return Number(usd);
}

export function rateToE8(foreignPerUsd: number): number {
  if (!Number.isFinite(foreignPerUsd) || foreignPerUsd <= 0) {
    throw new Error("Exchange rate must be a positive number");
  }
  return Math.round(foreignPerUsd * 100_000_000);
}
