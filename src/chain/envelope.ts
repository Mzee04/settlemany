export function encodePayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodePayload<T>(payload: string): T {
  const padded = payload.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((payload.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export function explorerTxUrl(network: "chipnet" | "mainnet", txid: string): string {
  if (network === "chipnet") return `https://explorer.selene.cash/tx/${txid}?network=chipnet`;
  return `https://explorer.bitcoinunlimited.info/tx/${txid}`;
}

export function explorerAddressUrl(network: "chipnet" | "mainnet", address: string): string {
  if (network === "chipnet") return `https://explorer.selene.cash/address/${address}?network=chipnet`;
  return `https://explorer.bitcoinunlimited.info/address/${address}`;
}
