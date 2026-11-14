import { formatUsd, satsToUsdCents } from "../domain/money.ts";
import { CopyButton } from "./bits.tsx";

export function ShortfallNotice({
  who,
  address,
  shortSats,
  priceCents,
}: {
  who: string;
  address: string;
  shortSats: bigint;
  priceCents: number;
}) {
  const usd = priceCents > 0 ? formatUsd(satsToUsdCents(shortSats, priceCents)) : "";
  return (
    <div className="alert" role="alert">
      <p>{who} does not have enough Bitcoin Cash on this address for the payment, the miner fee, and any token dust.</p>
      <p>Add at least {shortSats.toString()} sats{usd ? ` (about ${usd}).` : "."}</p>
      <p className="mono">{address}</p>
      <CopyButton value={address} label="Copy address" />
      <p>Paytaca HD wallets may hold funds on other addresses. Send a few cents to this connected address first, then try again.</p>
    </div>
  );
}
