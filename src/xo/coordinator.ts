import { encodeBip39Mnemonic, generateRandomBytes } from "@bitauth/libauth";

const STORAGE_KEY = "settlemany.xo-coordinator.v1";

/**
 * A BIP39 phrase used only to sign XO invitation commits.
 * It is generated in this browser and stored in localStorage. It is not a
 * wallet seed, it is not in the repository, and Settlemany never asks for one.
 */
export function existingCoordinatorMnemonic(): string | null {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (!existing) return null;
  const phrase = existing.trim();
  if (phrase.split(/\s+/).length < 12) return null;
  return phrase;
}

export function coordinatorMnemonic(): string {
  const existing = existingCoordinatorMnemonic();
  if (existing) return existing;
  const created = freshCoordinatorMnemonic();
  localStorage.setItem(STORAGE_KEY, created);
  return created;
}

export function freshCoordinatorMnemonic(): string {
  const encoded = encodeBip39Mnemonic(generateRandomBytes(16));
  if (typeof encoded === "string") return encoded;
  return encoded.phrase;
}
