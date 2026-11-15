import {
  binToHex,
  cashAddressToLockingBytecode,
  encodeLockingBytecodeP2pkh,
  hash160,
  isPayToPublicKeyHash,
  lockingBytecodeToCashAddress,
  secp256k1,
  sha256,
  utf8ToBin,
} from "@bitauth/libauth";

export type NetworkId = "chipnet" | "mainnet";

export function networkPrefix(network: NetworkId): "bitcoincash" | "bchtest" {
  return network === "mainnet" ? "bitcoincash" : "bchtest";
}

export function lockingBytecodeForAddress(address: string): Uint8Array {
  const decoded = cashAddressToLockingBytecode(address.trim());
  if (typeof decoded === "string") throw new Error(decoded);
  return decoded.bytecode;
}

/**
 * Locking-bytecode hex for a cashaddr, or null when the text is not one.
 * The network prefix and the token-aware type bit are not part of the result,
 * so `q` and `z` forms of one key, and `bitcoincash` and `bchtest` forms of
 * one script, share an identity.
 */
export function cashaddrIdentity(address: string): string | null {
  const decoded = cashAddressToLockingBytecode(address.trim());
  if (typeof decoded === "string") return null;
  return binToHex(decoded.bytecode);
}

/** True when both cashaddrs encode the same locking script. */
export function sameCashaddr(left: string, right: string): boolean {
  const a = cashaddrIdentity(left);
  const b = cashaddrIdentity(right);
  return a !== null && a === b;
}

export function addressNetwork(address: string): NetworkId {
  const decoded = cashAddressToLockingBytecode(address.trim());
  if (typeof decoded === "string") throw new Error(decoded);
  if (decoded.prefix === "bitcoincash") return "mainnet";
  if (decoded.prefix === "bchtest") return "chipnet";
  throw new Error(`Unsupported cashaddr prefix “${decoded.prefix}”`);
}

export function assertP2pkh(bytecode: Uint8Array): void {
  if (!isPayToPublicKeyHash(bytecode)) {
    throw new Error("Only P2PKH addresses can be spent. Contract and script outputs are left untouched.");
  }
}

export function assertAddressOnNetwork(address: string, network: NetworkId): Uint8Array {
  const actual = addressNetwork(address);
  if (actual !== network) {
    throw new Error(
      actual === "mainnet"
        ? "That address is mainnet. Switch the network toggle, or paste a chipnet address (bchtest:)."
        : "That address is chipnet. Switch the network toggle, or paste a mainnet address (bitcoincash:).",
    );
  }
  const bytecode = lockingBytecodeForAddress(address);
  assertP2pkh(bytecode);
  return bytecode;
}

export function addressFromLockingBytecode(bytecode: Uint8Array, network: NetworkId): string {
  const encoded = lockingBytecodeToCashAddress({
    bytecode,
    prefix: networkPrefix(network),
    tokenSupport: true,
  });
  if (typeof encoded === "string") throw new Error(encoded);
  return encoded.address;
}

export function p2pkhLockingBytecode(publicKey: Uint8Array): Uint8Array {
  return encodeLockingBytecodeP2pkh(hash160(publicKey));
}

/**
 * Public demo key. The phrase is not a secret. Do not send funds to it.
 * A label always derives the same key, which is what makes the demo reproducible.
 */
export function demoPrivateKey(label: string): Uint8Array {
  let material = sha256.hash(utf8ToBin(`settlemany-public-demo-v1:${label}`));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const publicKey = secp256k1.derivePublicKeyCompressed(material);
    if (typeof publicKey !== "string") return material;
    material = sha256.hash(material);
  }
  throw new Error("Could not derive a demo key");
}

export function demoIdentity(label: string, network: NetworkId = "chipnet"): {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  lockingBytecode: Uint8Array;
  address: string;
} {
  const privateKey = demoPrivateKey(label);
  const derived = secp256k1.derivePublicKeyCompressed(privateKey);
  if (typeof derived === "string") throw new Error(derived);
  const lockingBytecode = p2pkhLockingBytecode(derived);
  return {
    privateKey,
    publicKey: derived,
    lockingBytecode,
    address: addressFromLockingBytecode(lockingBytecode, network),
  };
}
