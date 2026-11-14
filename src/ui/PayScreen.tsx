import { useState } from "react";
import { PUSD_CATEGORY_MAINNET } from "../config.ts";
import { addressNetwork, lockingBytecodeForAddress } from "../chain/address.ts";
import { broadcast, coinsForAddress, withElectrum } from "../chain/electrum.ts";
import { encodePayload, explorerTxUrl } from "../chain/envelope.ts";
import { buildSettlement } from "../chain/settle.ts";
import { transactionHex } from "../chain/settle.ts";
import { signWithWallet } from "../chain/wallet.ts";
import { formatBch, formatUsd, usdCentsToSats } from "../domain/money.ts";
import { useStore } from "../state/store.tsx";
import { useWallet } from "./wallet.tsx";

export function PayScreen() {
  const store = useStore();
  const wallet = useWallet();
  const [dollars, setDollars] = useState("0.10");
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState<"bch" | "pusd">("bch");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cents = Math.round(Number(dollars) * 100);
  const price = store.priceCents ?? 0;
  const target = recipient.trim() || wallet.address || "";

  async function send() {
    setMessage(null);
    if (!wallet.manager || !wallet.address) {
      setMessage("Connect Paytaca or Selene first, on the same network as the toggle.");
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      setMessage("Enter a dollar amount such as 0.10.");
      return;
    }
    setBusy(true);
    try {
      addressNetwork(target);
      const amount = asset === "pusd" ? BigInt(cents) : usdCentsToSats(cents, price);
      if (asset === "bch" && price <= 0) throw new Error("Need a BCH price before converting $0.10.");
      const category = asset === "pusd" ? PUSD_CATEGORY_MAINNET : undefined;
      if (asset === "pusd" && store.network !== "mainnet") {
        throw new Error("PUSD lives on mainnet. Switch the toggle, or send the ten cents as BCH.");
      }
      const coins = await withElectrum(store.network, (client) => coinsForAddress(client, wallet.address!, "payer"));
      const built = buildSettlement({
        network: store.network,
        asset,
        tokenCategoryHex: category,
        memo: "Settlemany $0.10 demo",
        transfers: [{ fromId: "payer", toId: "recipient", amount }],
        addresses: { payer: wallet.address, recipient: target },
        coins,
      });
      const signed = await signWithWallet({
        manager: wallet.manager,
        transaction: built.transaction,
        sourceOutputs: built.sourceOutputs,
        inputIndexes: built.inputOwners.map((_, index) => index),
        prompt: `Send ${formatUsd(cents)} from Settlemany. You are paying ${target === wallet.address ? "yourself" : "the address you pasted"}.`,
      });
      const hex = transactionHex(signed);
      const txid = await withElectrum(store.network, (client) => broadcast(client, hex));
      window.location.hash = `#/receipt/${encodePayload({
        title: "Ten-cent demo",
        memo: "Settlemany $0.10 demo",
        network: store.network,
        asset,
        txid,
        verified: "Signed by your wallet and broadcast",
        broadcast: true,
        demo: false,
        feeSats: built.feeSats.toString(),
        lines: [
          `${formatUsd(cents)} to ${target}`,
          asset === "bch" ? formatBch(amount) : `${cents} PUSD units`,
          `Fee ${built.feeSats.toString()} sats`,
          explorerTxUrl(store.network, txid),
        ],
        note: target === wallet.address ? "You paid yourself, so only the fee left the wallet." : "Sent to the address you pasted.",
      })}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The payment did not go out.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <p className="muted">
        <a href="#/">Home</a>
      </p>
      <h1>Send a real $0.10</h1>
      <p className="lede">
        This is the small mainnet-or-chipnet action a judge can do alone. The default recipient is your own wallet, so
        the coins come back and you only pay the miner fee. Paste another CashTokens address if you want the ten cents
        to actually move.
      </p>
      {store.network === "mainnet" && (
        <p className="alert warn" role="status">
          Mainnet is selected. This spends real Bitcoin Cash.
        </p>
      )}
      <div className="card">
        <p>
          Wallet: {wallet.address ? <span className="mono">{wallet.address}</span> : "not connected"}
        </p>
        {!wallet.address && (
          <button className="btn primary" type="button" onClick={wallet.connect}>
            Connect wallet
          </button>
        )}
        <label className="field">
          <span>Dollars</span>
          <input value={dollars} onChange={(event) => setDollars(event.target.value)} inputMode="decimal" />
        </label>
        <label className="field">
          <span>Recipient</span>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder={wallet.address ?? "Leave blank to pay yourself"}
            spellCheck={false}
          />
        </label>
        <div className="seg" role="group" aria-label="Asset">
          <button type="button" aria-pressed={asset === "bch"} onClick={() => setAsset("bch")}>
            BCH
          </button>
          <button type="button" aria-pressed={asset === "pusd"} onClick={() => setAsset("pusd")}>
            PUSD
          </button>
        </div>
        {asset === "bch" && price > 0 && Number.isFinite(cents) && cents > 0 && (
          <p>{formatUsd(cents)} is about {formatBch(usdCentsToSats(cents, price))} at ${ (price / 100).toFixed(2) }.</p>
        )}
        <p className="muted">The wallet must be on {store.network}. WizardConnect is asked not to broadcast; Settlemany broadcasts after the signature checks out.</p>
        {message && (
          <p className="alert" role="alert">
            {message}
          </p>
        )}
        <button className="btn primary" type="button" disabled={busy} onClick={() => void send()}>
          {busy ? "Waiting on the wallet…" : "Sign and broadcast"}
        </button>
        <p className="muted">
          Locking script check uses {wallet.address ? "your connected address" : "the address you connect"}.{" "}
          {target && <span className="mono">{safe(target)}</span>}
        </p>
      </div>
    </div>
  );
}

function safe(address: string): string {
  try {
    lockingBytecodeForAddress(address);
    return address;
  } catch {
    return "Recipient is not a cashaddr yet.";
  }
}
