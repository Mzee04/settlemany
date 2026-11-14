import { encodeLockingBytecodeP2pkh, hash160, hexToBin, secp256k1 } from "@bitauth/libauth";
import { describe, expect, it } from "vitest";
import { cashAddressToLockingBytecode, lockingBytecodeToCashAddress } from "@bitauth/libauth";
import { demoIdentity, demoPrivateKey } from "./address.ts";
import { PAYTACA_ADDRESS, PRIZE_ADDRESS } from "../config.ts";
import { buildSettlement } from "./settle.ts";
import { buildPaytacaSignRequest, indexFromSession, pathsFromSession, relayUnlockIsEmpty, type SessionLookup } from "./paytaca.ts";

function pubkey(label: string): Uint8Array {
  const derived = secp256k1.derivePublicKeyCompressed(demoPrivateKey(label));
  if (typeof derived === "string") throw new Error(derived);
  return derived;
}

function lookup(keys: Record<string, Uint8Array>, fundedPaths: number[]): SessionLookup {
  return {
    paths: pathsFromSession([{ name: "receive" }, { name: "change" }, { name: "defi" }]),
    getPubkey(childIndex, index) {
      if (!fundedPaths.includes(childIndex)) return undefined;
      return keys[`${childIndex}:${index}`] ?? pubkey(`pad-${childIndex}-${index}`);
    },
  };
}

describe("Paytaca sign request", () => {
  const receiveKey = pubkey("receive-4");
  const changeKey = pubkey("change-2");
  const otherKey = pubkey("already-signed");
  const session = lookup(
    {
      "0:0": pubkey("receive-0"),
      "0:4": receiveKey,
      "1:2": changeKey,
    },
    [0, 1],
  );

  it("reads the address index from the session xpub, including an index that is not zero", () => {
    const located = indexFromSession(session, encodeLockingBytecodeP2pkh(hash160(receiveKey)));
    expect(located).toEqual({ name: "receive", addressIndex: 4 });
    const change = indexFromSession(session, encodeLockingBytecodeP2pkh(hash160(changeKey)));
    expect(change).toEqual({ name: "change", addressIndex: 2 });
  });

  it("does not invent an index when the session has no matching key", () => {
    expect(indexFromSession(session, encodeLockingBytecodeP2pkh(hash160(otherKey)))).toBeNull();
    expect(indexFromSession(lookup({}, []), encodeLockingBytecodeP2pkh(hash160(receiveKey)))).toBeNull();
  });

  it("ignores contract paths the wallet may also send", () => {
    expect(pathsFromSession([{ name: "receive" }, { name: "defi" }, { name: "change" }]).map((path) => path.name)).toEqual([
      "receive",
      "change",
    ]);
  });

  it("empties only the signer's source outputs, keeps the other signature, and does not broadcast", () => {
    const ada = demoIdentity("paytaca-ada");
    const bob = demoIdentity("paytaca-bob");
    const transaction = {
      version: 2,
      locktime: 0,
      inputs: [
        {
          outpointTransactionHash: hexToBin("11".repeat(32)),
          outpointIndex: 0,
          sequenceNumber: 0xffffffff,
          unlockingBytecode: new Uint8Array(),
        },
        {
          outpointTransactionHash: hexToBin("22".repeat(32)),
          outpointIndex: 1,
          sequenceNumber: 0xffffffff,
          unlockingBytecode: Uint8Array.from([0x01, 0x02, 0x03]),
        },
      ],
      outputs: [{ lockingBytecode: ada.lockingBytecode, valueSatoshis: 1_000n }],
    };
    const sourceOutputs = [
      { lockingBytecode: ada.lockingBytecode, valueSatoshis: 5_000n },
      { lockingBytecode: bob.lockingBytecode, valueSatoshis: 5_000n },
    ];
    const request = buildPaytacaSignRequest({
      transaction,
      sourceOutputs,
      signerIndexes: [0],
      locate: (locking) => (binEquals(locking, ada.lockingBytecode) ? { name: "receive", addressIndex: 4 } : null),
      userPrompt: "Sign only your inputs",
    });

    expect(request.transaction.broadcast).toBe(false);
    expect(request.inputPaths).toEqual([[0, "receive", 4]]);
    expect(relayUnlockIsEmpty(request.transaction.sourceOutputs[0]?.unlockingBytecode)).toBe(true);
    expect(request.transaction.sourceOutputs[1]?.unlockingBytecode).toBe("010203");
    expect(request.inputPaths.some((path) => path[0] === 1)).toBe(false);
  });

  it("refuses a contract coin instead of asking Paytaca to sign it", () => {
    const ada = demoIdentity("contract-ada");
    const bob = demoIdentity("contract-bob");
    const contract = Uint8Array.from([0xa9, 0x14, ...hash160(ada.publicKey), 0x87]);
    expect(() =>
      buildSettlement({
        network: "chipnet",
        asset: "bch",
        transfers: [{ fromId: "ada", toId: "bob", amount: 20_000n }],
        addresses: { ada: ada.address, bob: bob.address },
        coins: [
          {
            txid: "33".repeat(32),
            vout: 0,
            satoshis: 80_000n,
            lockingBytecode: contract,
            tokenAmount: 0n,
            tokenCategoryHex: null,
            ownerId: "ada",
          },
        ],
      }),
    ).toThrow(/P2PKH|satoshis/);
  });
});

function binEquals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

describe("prize CashTokens address", () => {
  it("is the token-aware form of the Paytaca address", () => {
    const decoded = cashAddressToLockingBytecode(PAYTACA_ADDRESS);
    if (typeof decoded === "string") throw new Error(decoded);
    const token = lockingBytecodeToCashAddress({
      bytecode: decoded.bytecode,
      prefix: "bitcoincash",
      tokenSupport: true,
    });
    if (typeof token === "string") throw new Error(token);
    expect(token.address).toBe(PRIZE_ADDRESS);
    expect(PRIZE_ADDRESS.startsWith("bitcoincash:z")).toBe(true);
  });
});
