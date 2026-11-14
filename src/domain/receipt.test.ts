import { describe, expect, it } from "vitest";
import { receiptCsv, receiptPayments, receiptPdfLines, receiptStatusLine, RECEIPT_HEADERS } from "./receipt.ts";

const payments = receiptPayments({
  date: "2026-11-14T01:40:00.000Z",
  group: "Chipnet friends",
  network: "chipnet",
  asset: "bch",
  feeSats: "437",
  txid: "10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927",
  legs: [
    {
      fromName: "me",
      fromAddress: "bchtest:zpjfemuqvwy4kfay7p6j6kkqls4rxxkv7uvdw9ghdg",
      toName: "receiver",
      toAddress: "bchtest:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsw62cptj7",
      usdCents: 1,
      amount: "4530",
    },
    {
      fromName: "friend",
      fromAddress: "bchtest:zzh0srv55mem9nd8508llyuchm6e5vea9ylmynsfxy",
      toName: "receiver",
      toAddress: "bchtest:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsw62cptj7",
      usdCents: 1,
      amount: "4530",
    },
  ],
});

describe("receipt table", () => {
  it("writes one header and one row per payment, with the fee only on the first row", () => {
    const csv = receiptCsv(payments);
    const [header, first, second] = csv.split("\n");
    expect(header).toBe(RECEIPT_HEADERS.join(","));
    expect(header?.includes("line")).toBe(false);
    expect(first).toContain("2026-11-14T01:40:00.000Z");
    expect(first).toContain("Chipnet friends");
    expect(first).toContain("me");
    expect(first).toContain("bchtest:zpjfemuqvwy4kfay7p6j6kkqls4rxxkv7uvdw9ghdg");
    expect(first).toContain("0.01");
    expect(first).toContain("4530");
    expect(first).toContain(",437,");
    expect(first).toContain("10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927");
    expect(first).toContain("https://explorer.selene.cash/tx/10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927?network=chipnet");
    expect(second).toContain("friend");
    expect(second).toContain("bchtest:zzh0srv55mem9nd8508llyuchm6e5vea9ylmynsfxy");
    expect(second?.includes(",437,")).toBe(false);
    expect(csv.split("Chipnet friends").length - 1).toBe(2);
  });

  it("says the wallet signed a send, and names the fee", () => {
    expect(
      receiptStatusLine({
        broadcast: true,
        verified: "Your wallet signed it and Settlemany broadcast it",
        note: "You paid yourself, so only the 264-sat fee left the wallet.",
      }),
    ).toBe(
      "Sent. Your wallet signed it and Settlemany broadcast it. You paid yourself, so only the 264-sat fee left the wallet.",
    );
    expect(
      receiptStatusLine({
        broadcast: false,
        verified: "Valid on the Bitcoin Cash virtual machine",
      }),
    ).toBe("Not broadcast. Valid on the Bitcoin Cash virtual machine.");
  });

  it("does not repeat a title column in the PDF lines", () => {
    const lines = receiptPdfLines(payments);
    expect(lines[0]).toBe("Settlemany receipt");
    expect(lines[1]).toBe(RECEIPT_HEADERS.join(", "));
    expect(lines.filter((line) => line.startsWith("Settlemany receipt"))).toHaveLength(1);
    expect(lines.filter((line) => line.includes("fee_sats 437"))).toHaveLength(1);
    expect(lines.some((line) => line.includes("from_address bchtest:zpjfemuqvwy4kfay7p6j6kkqls4rxxkv7uvdw9ghdg"))).toBe(true);
    expect(lines.filter((line) => line.startsWith("txid "))).toHaveLength(2);
  });
});
