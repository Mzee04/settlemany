import { describe, expect, it } from "vitest";
import { ElectrumClient } from "./electrum.ts";

describe("chipnet electrum", () => {
  it("answers server.version on a public Fulcrum endpoint", async () => {
    const client = new ElectrumClient("wss://chipnet.bch.ninja:50004");
    await client.connect(8_000);
    const version = await client.request("server.version", ["Settlemany", "1.4"]);
    client.close();
    expect(Array.isArray(version)).toBe(true);
    expect(String((version as string[])[0])).toMatch(/Fulcrum|Electrum/);
  });
});
