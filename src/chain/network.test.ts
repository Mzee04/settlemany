import { describe, expect, it } from "vitest";
import { PUSD_CATEGORY_CHIPNET, PUSD_CATEGORY_MAINNET } from "../config.ts";
import { assertAddressOnNetwork, demoIdentity } from "./address.ts";
import { ELECTRUM_SERVERS } from "./electrum.ts";
import { explorerTxUrl } from "./envelope.ts";
import { DEFAULT_NETWORK, networkFromSearch, resolveNetwork } from "./network.ts";

describe("default network", () => {
  it("is mainnet unless the page asks for chipnet or mainnet", () => {
    expect(DEFAULT_NETWORK).toBe("mainnet");
    expect(resolveNetwork("")).toBe("mainnet");
    expect(resolveNetwork("?network=chipnet")).toBe("chipnet");
    expect(resolveNetwork("?network=mainnet")).toBe("mainnet");
    expect(networkFromSearch("?network=chipnet")).toBe("chipnet");
    expect(networkFromSearch("?network=mainnet")).toBe("mainnet");
    expect(networkFromSearch("?foo=1")).toBeNull();
  });

  it("derives the judge demo on the prefix for that network", () => {
    expect(demoIdentity("judge", "mainnet").address.startsWith("bitcoincash:")).toBe(true);
    expect(demoIdentity("judge", "chipnet").address.startsWith("bchtest:")).toBe(true);
  });

  it("rejects an address from the other network", () => {
    const chipnet = demoIdentity("judge", "chipnet").address;
    const mainnet = demoIdentity("judge", "mainnet").address;
    expect(() => assertAddressOnNetwork(chipnet, "mainnet")).toThrow(/chipnet/);
    expect(() => assertAddressOnNetwork(mainnet, "chipnet")).toThrow(/mainnet/);
  });

  it("uses Bitcoin Unlimited on mainnet and Selene on chipnet", () => {
    const txid = "aa".repeat(32);
    expect(explorerTxUrl("mainnet", txid)).toBe(`https://explorer.bitcoinunlimited.info/tx/${txid}`);
    expect(explorerTxUrl("chipnet", txid)).toBe(`https://explorer.selene.cash/tx/${txid}?network=chipnet`);
  });

  it("lists public wss Fulcrum servers", () => {
    expect(ELECTRUM_SERVERS.mainnet.length).toBeGreaterThan(1);
    expect(ELECTRUM_SERVERS.mainnet[0]?.startsWith("wss://")).toBe(true);
    expect(ELECTRUM_SERVERS.chipnet.every((url) => url.startsWith("wss://"))).toBe(true);
  });

  it("keeps the published ParyonUSD category", () => {
    expect(PUSD_CATEGORY_MAINNET).toBe("2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544");
    expect(PUSD_CATEGORY_CHIPNET).toBe("");
  });
});
