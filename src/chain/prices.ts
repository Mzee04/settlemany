export async function fetchBchUsdCents(): Promise<number> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd");
    if (response.ok) {
      const body = (await response.json()) as { "bitcoin-cash"?: { usd?: number } };
      const usd = body["bitcoin-cash"]?.usd;
      if (usd && Number.isFinite(usd)) return Math.round(usd * 100);
    }
  } catch {
    // Try the second feed below.
  }
  const paprika = await fetch("https://api.coinpaprika.com/v1/tickers/bch-bitcoin-cash");
  if (!paprika.ok) throw new Error("The BCH price feed did not respond.");
  const body = (await paprika.json()) as { quotes?: { USD?: { price?: number } } };
  const usd = body.quotes?.USD?.price;
  if (!usd || !Number.isFinite(usd)) throw new Error("The BCH price feed returned no price.");
  return Math.round(usd * 100);
}

/** Foreign major units per 1 USD, times 1e8. USD itself is 1e8. */
export async function fetchUsdRates(): Promise<Record<string, number>> {
  const response = await fetch("https://api.frankfurter.app/latest?from=USD");
  if (!response.ok) throw new Error("Exchange rates did not load.");
  const body = (await response.json()) as { rates?: Record<string, number> };
  const rates: Record<string, number> = { USD: 100_000_000 };
  for (const [code, perUsd] of Object.entries(body.rates ?? {})) {
    if (Number.isFinite(perUsd) && perUsd > 0) rates[code] = Math.round(perUsd * 100_000_000);
  }
  return rates;
}
