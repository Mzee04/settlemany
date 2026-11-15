import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { downloadBytes, downloadText } from "../domain/export.ts";
import { receiptCsv, receiptTablePdf, type ReceiptPayment } from "../domain/receipt.ts";

export function QrCode({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, value, {
      width: 220,
      margin: 1,
      color: { dark: "#241c16", light: "#fffaf3" },
    }).catch(() => undefined);
  }, [value]);
  return <canvas ref={ref} role="img" aria-label="QR code" />;
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn ghost"
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          })
          .catch(() => undefined);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function downloadReceiptFiles(payments: ReceiptPayment[]): void {
  downloadText("settlemany-receipt.csv", receiptCsv(payments), "text/csv");
  downloadBytes("settlemany-receipt.pdf", receiptTablePdf(payments), "application/pdf");
}
