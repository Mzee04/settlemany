import { useMemo } from "react";
import { decodePayload, encodePayload, explorerTxUrl } from "../chain/envelope.ts";
import { receiptPayments, type ReceiptPayment } from "../domain/receipt.ts";
import { CopyButton, downloadReceiptFiles } from "./bits.tsx";
import { pageUrl } from "./url.ts";
import type { NetworkId } from "../chain/address.ts";

type Receipt = {
  title: string;
  memo: string;
  network: NetworkId;
  asset: "bch" | "pusd";
  txid: string | null;
  verified: string;
  broadcast: boolean;
  demo: boolean;
  feeSats: string;
  lines: string[];
  payments?: ReceiptPayment[];
  createdAt?: string;
  note?: string;
};

export function ReceiptScreen({ payload }: { payload: string }) {
  const receipt = useMemo(() => {
    try {
      return decodePayload<Receipt>(payload);
    } catch {
      return null;
    }
  }, [payload]);
  if (!receipt) {
    return (
      <div className="page">
        <p className="alert" role="alert">
          This receipt link could not be read.
        </p>
      </div>
    );
  }
  const link = pageUrl(`#/receipt/${encodePayload(receipt)}`);
  const payments = receipt.payments?.length
    ? receipt.payments
    : receiptPayments({
        date: receipt.createdAt ?? "",
        group: receipt.memo || receipt.title,
        network: receipt.network,
        asset: receipt.asset,
        feeSats: receipt.feeSats || "0",
        txid: receipt.txid ?? "",
        legs: [
          {
            fromName: "",
            toName: "",
            fromAddress: "",
            toAddress: "",
            usdCents: 0,
            amount: "",
          },
        ],
      });

  return (
    <div className="page">
      <p className="muted">
        <a href="#/">Home</a>
      </p>
      <h1>{receipt.title}</h1>
      <p className={receipt.broadcast ? "alert ok" : "alert warn"} role="status">
        {receipt.broadcast ? "Broadcast." : "Not broadcast."} {receipt.verified}
        {receipt.note ? ` ${receipt.note}` : ""}
      </p>
      <section className="card">
        <h2>{receipt.memo}</h2>
        <ul>
          {receipt.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          Fee {receipt.feeSats} sats · {receipt.network} · {receipt.asset.toUpperCase()}
        </p>
        {receipt.txid && (
          <p>
            <a href={explorerTxUrl(receipt.network, receipt.txid)}>View {receipt.txid.slice(0, 16)}… on the explorer</a>
          </p>
        )}
        <div className="row">
          <CopyButton value={link} label="Copy receipt link" />
          <button className="btn ghost" type="button" onClick={() => downloadReceiptFiles(payments)}>
            Download CSV and PDF
          </button>
        </div>
      </section>
    </div>
  );
}
