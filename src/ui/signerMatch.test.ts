import { describe, expect, it } from "vitest";
import { lockingBytecodeToCashAddress } from "@bitauth/libauth";
import { demoIdentity } from "../chain/address.ts";
import {
  disconnectedHint,
  matchConnectedSigner,
  mismatchWarning,
  readyToSignText,
  unsignedDebtors,
  connectedAddressLabel,
  type UnsignedDebtor,
} from "./signerMatch.ts";

function form(label: string, tokenSupport: boolean): string {
  const identity = demoIdentity(label, "chipnet");
  const encoded = lockingBytecodeToCashAddress({
    bytecode: identity.lockingBytecode,
    prefix: "bchtest",
    tokenSupport,
  });
  if (typeof encoded === "string") throw new Error(encoded);
  return encoded.address;
}

const ada = form("ada", true);
const adaPlain = form("ada", false);
const adaMainnet = demoIdentity("ada", "mainnet").address;
const bob = form("bob", true);

describe("unsigned debtors", () => {
  const inputs = [
    { index: 0, ownerId: "ada", ownerName: "Adaeze" },
    { index: 1, ownerId: "ada", ownerName: "Adaeze" },
    { index: 2, ownerId: "bob", ownerName: "Bisi" },
  ];
  const addresses = { ada, bob };

  it("keeps a debtor who has signed only some inputs", () => {
    expect(unsignedDebtors(inputs, addresses, new Set([0]))).toEqual([
      { ownerId: "ada", name: "Adaeze", address: ada },
      { ownerId: "bob", name: "Bisi", address: bob },
    ]);
  });

  it("drops a debtor whose inputs are all signed", () => {
    expect(unsignedDebtors(inputs, addresses, new Set([0, 1]))).toEqual([
      { ownerId: "bob", name: "Bisi", address: bob },
    ]);
  });
});

describe("connected signer match", () => {
  const unsigned: UnsignedDebtor[] = [
    { ownerId: "ada", name: "Adaeze", address: ada },
    { ownerId: "bob", name: "Bisi", address: bob },
  ];

  it("is ready when the wallet is the q or z form, or another prefix, of an unsigned debtor", () => {
    expect(matchConnectedSigner(adaPlain, unsigned)).toEqual({ status: "ready", names: ["Adaeze"] });
    expect(matchConnectedSigner(adaMainnet, unsigned)).toEqual({ status: "ready", names: ["Adaeze"] });
    expect(matchConnectedSigner(`  ${ada.toUpperCase()} `, unsigned).status).toBe("ready");
  });

  it("warns when the wallet is a different key", () => {
    const other = form("chinedu", true);
    expect(matchConnectedSigner(other, unsigned)).toEqual({ status: "mismatch", unsigned });
  });

  it("stays quiet when nobody is left to sign, and asks for a wallet otherwise", () => {
    expect(matchConnectedSigner(ada, [])).toEqual({ status: "clear" });
    expect(matchConnectedSigner(null, unsigned)).toEqual({ status: "disconnected" });
    expect(matchConnectedSigner("  ", unsigned)).toEqual({ status: "disconnected" });
  });
});

describe("signer copy", () => {
  it("names the matching person", () => {
    expect(readyToSignText(["Adaeze"])).toBe("This is Adaeze, ready to sign.");
    expect(readyToSignText(["Adaeze", "Bisi"])).toBe("This is Adaeze and Bisi, ready to sign.");
  });

  it("warns with the unsigned debtor address and the People hint", () => {
    expect(
      mismatchWarning([{ ownerId: "ada", name: "Adaeze", address: ada }]),
    ).toBe(
      `Connected wallet is not any unsigned debtor. Adaeze needs to sign from ${ada}. Reconnect with that address, or update Adaeze's address in People.`,
    );
    expect(connectedAddressLabel("Adaeze")).toBe("Use connected address for Adaeze");
  });

  it("lists every unsigned debtor when several still need to sign", () => {
    expect(
      mismatchWarning([
        { ownerId: "ada", name: "Adaeze", address: ada },
        { ownerId: "bob", name: "Bisi", address: bob },
      ]),
    ).toBe(
      `Connected wallet is not any unsigned debtor. Adaeze needs to sign from ${ada}. Bisi needs to sign from ${bob}. Reconnect with one of those addresses, or update their addresses in People.`,
    );
  });

  it("tells a disconnected signer which address to connect", () => {
    expect(disconnectedHint([{ ownerId: "ada", name: "Adaeze", address: ada }])).toBe(
      `Adaeze needs to sign from ${ada}. Connect that wallet before you sign.`,
    );
  });
});
