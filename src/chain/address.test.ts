import { binToHex, lockingBytecodeToCashAddress } from "@bitauth/libauth";
import { describe, expect, it } from "vitest";
import { PAYTACA_ADDRESS, PRIZE_ADDRESS } from "../config.ts";
import { cashaddrIdentity, demoIdentity, sameCashaddr } from "./address.ts";

function encode(bytecode: Uint8Array, prefix: "bitcoincash" | "bchtest", tokenSupport: boolean): string {
  const encoded = lockingBytecodeToCashAddress({ bytecode, prefix, tokenSupport });
  if (typeof encoded === "string") throw new Error(encoded);
  return encoded.address;
}

describe("cashaddr identity", () => {
  const ada = demoIdentity("ada", "chipnet");
  const q = encode(ada.lockingBytecode, "bchtest", false);
  const z = encode(ada.lockingBytecode, "bchtest", true);
  const mainnet = encode(ada.lockingBytecode, "bitcoincash", true);

  it("treats q and z token-aware forms of the same key as one address", () => {
    expect(q.startsWith("bchtest:q")).toBe(true);
    expect(z.startsWith("bchtest:z")).toBe(true);
    expect(q).not.toBe(z);
    expect(cashaddrIdentity(q)).toBe(binToHex(ada.lockingBytecode));
    expect(cashaddrIdentity(z)).toBe(cashaddrIdentity(q));
    expect(sameCashaddr(q, z)).toBe(true);
  });

  it("ignores the network prefix when the locking script matches", () => {
    expect(mainnet.startsWith("bitcoincash:")).toBe(true);
    expect(mainnet).not.toBe(z);
    expect(sameCashaddr(mainnet, z)).toBe(true);
    expect(sameCashaddr(demoIdentity("ada", "mainnet").address, demoIdentity("ada", "chipnet").address)).toBe(true);
  });

  it("matches the published Paytaca address and its CashTokens form", () => {
    expect(PAYTACA_ADDRESS.startsWith("bitcoincash:q")).toBe(true);
    expect(PRIZE_ADDRESS.startsWith("bitcoincash:z")).toBe(true);
    expect(sameCashaddr(PAYTACA_ADDRESS, PRIZE_ADDRESS)).toBe(true);
  });

  it("rejects a different key", () => {
    const bob = demoIdentity("bob", "chipnet").address;
    expect(sameCashaddr(z, bob)).toBe(false);
    expect(cashaddrIdentity(z)).not.toBe(cashaddrIdentity(bob));
  });

  it("ignores surrounding space and cashaddr case", () => {
    expect(sameCashaddr(`  ${q.toUpperCase()}  `, z)).toBe(true);
    expect(cashaddrIdentity(` ${mainnet} `)).toBe(cashaddrIdentity(z));
  });

  it("returns null for text that is not a cashaddr", () => {
    expect(cashaddrIdentity("")).toBeNull();
    expect(cashaddrIdentity("not-an-address")).toBeNull();
    expect(cashaddrIdentity("bitcoincash:qqqq")).toBeNull();
    expect(sameCashaddr(q, "not-an-address")).toBe(false);
    expect(sameCashaddr("", "")).toBe(false);
  });
});
