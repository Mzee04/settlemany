import type { NetworkId } from "./address.ts";

export const DEFAULT_NETWORK: NetworkId = "mainnet";

export function networkFromSearch(search: string): NetworkId | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(query).get("network");
  if (value === "chipnet" || value === "mainnet") return value;
  return null;
}

export function resolveNetwork(search: string): NetworkId {
  return networkFromSearch(search) ?? DEFAULT_NETWORK;
}
