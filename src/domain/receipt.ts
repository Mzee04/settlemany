import { explorerTxUrl } from "../chain/envelope.ts";
import { receiptPdf, toCsv } from "./export.ts";

export const RECEIPT_HEADERS = [
  "date",
  "group",
  "network",
  "asset",
  "from_name",
  "from_address",
  "to_name",
  "to_address",
  "usd",
  "amount",
  "fee_sats",
  "txid",
  "explorer_url",
] as const;

export type ReceiptPayment = {
  date: string;
  group: string;
  network: string;
  asset: string;
  fromName: string;
  fromAddress: string;
  toName: string;
  toAddress: string;
  /** Dollars, two decimal places. */
  usd: string;
  /** Satoshis, or token base units when the asset is a CashToken. */
  amount: string;
  feeSats: string;
  txid: string;
  explorerUrl: string;
};

export function usdFromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${(abs / 100).toFixed(2)}`;
}

function sentence(value: string): string {
  const text = value.trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function receiptStatusLine(input: { broadcast: boolean; verified: string; note?: string }): string {
  const lead = input.broadcast ? "Sent." : "Not broadcast.";
  const rest = [input.verified, input.note ?? ""].map(sentence).filter(Boolean);
  return [lead, ...rest].join(" ");
}

export function receiptPayments(args: {
  date: string;
  group: string;
  network: "chipnet" | "mainnet";
  asset: string;
  feeSats: string;
  txid: string;
  legs: {
    fromName: string;
    toName: string;
    fromAddress: string;
    toAddress: string;
    usdCents: number;
    amount: string;
  }[];
}): ReceiptPayment[] {
  const explorerUrl = args.txid ? explorerTxUrl(args.network, args.txid) : "";
  return args.legs.map((leg) => ({
    date: args.date,
    group: args.group,
    network: args.network,
    asset: args.asset,
    fromName: leg.fromName,
    fromAddress: leg.fromAddress,
    toName: leg.toName,
    toAddress: leg.toAddress,
    usd: usdFromCents(leg.usdCents),
    amount: leg.amount,
    feeSats: args.feeSats,
    txid: args.txid,
    explorerUrl,
  }));
}

export function receiptCsv(payments: ReceiptPayment[]): string {
  const rows = payments.map((payment, index) => [
    payment.date,
    payment.group,
    payment.network,
    payment.asset,
    payment.fromName,
    payment.fromAddress,
    payment.toName,
    payment.toAddress,
    payment.usd,
    payment.amount,
    index === 0 ? payment.feeSats : "",
    payment.txid,
    payment.explorerUrl,
  ]);
  return toCsv([[...RECEIPT_HEADERS], ...rows]);
}

/** Same columns as the CSV, one payment at a time, fee stated once. */
export function receiptPdfLines(payments: ReceiptPayment[]): string[] {
  const lines = ["Settlemany receipt", RECEIPT_HEADERS.join(", ")];
  for (const [index, payment] of payments.entries()) {
    lines.push(`${payment.date} | ${payment.group} | ${payment.network} | ${payment.asset}`);
    lines.push(`from_name ${payment.fromName}`);
    lines.push(`from_address ${payment.fromAddress}`);
    lines.push(`to_name ${payment.toName}`);
    lines.push(`to_address ${payment.toAddress}`);
    lines.push(`usd ${payment.usd} | amount ${payment.amount}${index === 0 ? ` | fee_sats ${payment.feeSats}` : ""}`);
    lines.push(`txid ${payment.txid}`);
    lines.push(payment.explorerUrl);
  }
  return lines;
}

export function receiptTablePdf(payments: ReceiptPayment[]): Uint8Array {
  return receiptPdf(receiptPdfLines(payments));
}
