import { useCallback, useEffect, useRef, useState } from "react";
import { PUSD_CATEGORY_MAINNET } from "../config.ts";
import { assertAddressOnNetwork, lockingBytecodeForAddress } from "../chain/address.ts";
import { broadcast, coinsForAddress, withElectrum } from "../chain/electrum.ts";
import { encodePayload } from "../chain/envelope.ts";
import { buildSettlement, SettleError } from "../chain/settle.ts";
import { transactionHex } from "../chain/settle.ts";
import { signWithWallet } from "../chain/wallet.ts";
import { formatBch, formatUsd, satsToUsdCents, usdCentsToSats } from "../domain/money.ts";
import { receiptPayments } from "../domain/receipt.ts";
import { useStore } from "../state/store.tsx";
import { CopyButton } from "./bits.tsx";
import { ShortfallNotice } from "./shortfall.tsx";
import { useWallet } from "./wallet.tsx";

type Balance =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; sats: bigint }
  | { kind: "error"; message: string };

export function PayScreen() {
  const store = useStore();
  const wallet = useWallet();
  const [dollars, setDollars] = useState("0.02");
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState<"bch" | "pusd">("bch");
  const [message, setMessage] = useState<string | null>(null);
  const [shortSats, setShortSats] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<Balance>({ kind: "idle" });
  const request = useRef(0);
  const cents = Math.round(Number(dollars) * 100);
  const price = store.priceCents ?? 0;
  const target = recipient.trim() || wallet.address || "";
  const recipientError = recipientProblem(recipient, store.network);

  const loadBalance = useCallback(async (address: string) => {
    const ticket = ++request.current;
    setBalance({ kind: "loading" });
    try {
      const coins = await withElectrum(store.network, (client) => coinsForAddress(client, address, "payer"));
      if (ticket !== request.current) return;
      const sats = coins.reduce((sum, coin) => sum + coin.satoshis, 0n);
      setBalance({ kind: "ready", sats });
    } catch (error) {
      if (ticket !== request.current) return;
      setBalance({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not read this address.",
      });
    }
  }, [store.network]);

  useEffect(() => {
    if (!wallet.address) return;
    void loadBalance(wallet.address);
    return () => {
      request.current += 1;
    };
  }, [wallet.address, loadBalance]);

  async function send() {
    setMessage(null);
    setShortSats(null);
    if (!wallet.manager || !wallet.address) {
      setMessage("Connect Paytaca or Selene first, on the same network as the toggle.");
      return;
    }
    if (recipientError) {
      setMessage(recipientError);
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      setMessage("Enter a dollar amount such as 0.02.");
      return;
    }
    setBusy(true);
    try {
      assertAddressOnNetwork(wallet.address, store.network);
      assertAddressOnNetwork(target, store.network);
      const amount = asset === "pusd" ? BigInt(cents) : usdCentsToSats(cents, price);
      if (asset === "bch" && price <= 0) throw new Error("Need a BCH price before converting dollars to satoshis.");
      const category = asset === "pusd" ? PUSD_CATEGORY_MAINNET : undefined;
      if (asset === "pusd" && store.network !== "mainnet") {
        throw new Error("PUSD lives on mainnet. Switch the toggle, or send this amount as BCH.");
      }
      const coins = await withElectrum(store.network, (client) => coinsForAddress(client, wallet.address!, "payer"));
      const built = buildSettlement({
        network: store.network,
        asset,
        tokenCategoryHex: category,
        memo: "Settlemany payment",
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
      await loadBalance(wallet.address);
      const fee = built.feeSats.toString();
      window.location.hash = `#/receipt/${encodePayload({
        title: "Bitcoin Cash payment",
        memo: "Settlemany payment",
        network: store.network,
        asset,
        txid,
        verified: "Your wallet signed it and Settlemany broadcast it",
        broadcast: true,
        demo: false,
        feeSats: fee,
        createdAt: new Date().toISOString(),
        payments: receiptPayments({
          date: new Date().toISOString(),
          group: "Settlemany payment",
          network: store.network,
          asset,
          feeSats: fee,
          txid,
          legs: [
            {
              fromName: "Payer",
              toName: target === wallet.address ? "Yourself" : "Recipient",
              fromAddress: wallet.address ?? "",
              toAddress: target,
              usdCents: cents,
              amount: amount.toString(),
            },
          ],
        }),
        lines: [`${formatUsd(cents)} to ${target}`, asset === "bch" ? formatBch(amount) : `${cents} PUSD units`],
        note:
          target === wallet.address
            ? `You paid yourself, so only the ${fee}-sat fee left the wallet.`
            : "Sent to the address you pasted.",
      })}`;
    } catch (error) {
      if (wallet.address) await loadBalance(wallet.address);
      if (error instanceof SettleError && error.code === "need-bch" && error.detail.shortSats !== undefined) {
        setShortSats(error.detail.shortSats);
        setMessage(null);
      } else {
        setMessage(error instanceof Error ? error.message : "The payment did not go out.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <p className="muted">
        <a href="#/">Home</a>
      </p>
      <h1>{store.network === "mainnet" ? "Send Bitcoin Cash on mainnet" : "Send a chipnet test"}</h1>
      <p className="lede">
        Connect Paytaca. Mainnet is real money, so start with a few cents. The default recipient is your own wallet, so
        the coins come back and you only pay the miner fee. Paste another address if you want the payment to move.
      </p>
      {store.network === "mainnet" && (
        <p className="alert warn" role="status">
          Mainnet is selected. This spends real Bitcoin Cash. A first test of a few cents is enough.
        </p>
      )}
      <div className="card">
        {wallet.address ? (
          <p className="row">
            <span className="mono">{wallet.address}</span>
            <CopyButton value={wallet.address} label="Copy address" />
          </p>
        ) : (
          <p>Not connected.</p>
        )}
        {!wallet.address && (
          <button className="btn primary" type="button" onClick={wallet.connect}>
            Connect wallet
          </button>
        )}
        {wallet.address && balance.kind === "loading" && <p>Checking this address…</p>}
        {wallet.address && balance.kind === "ready" && (
          <p>
            Balance of this address: {formatBch(balance.sats)}
            {price > 0 ? ` · about ${formatUsd(satsToUsdCents(balance.sats, price))}` : ""}.
            {balance.sats === 0n ? " No coins here yet. Send a few cents to this address first." : ""}
          </p>
        )}
        {wallet.address && balance.kind === "error" && (
          <p className="alert" role="alert">
            {balance.message}
          </p>
        )}
        {wallet.address && (
          <p>
            <button className="btn ghost" type="button" onClick={() => void loadBalance(wallet.address!)}>
              Refresh balance
            </button>
          </p>
        )}
        <label className="field" htmlFor="pay-dollars">
          <span>Dollars</span>
          <input id="pay-dollars" value={dollars} onChange={(event) => setDollars(event.target.value)} inputMode="decimal" />
        </label>
        <label className="field" htmlFor="pay-recipient">
          <span>Recipient</span>
          <input
            id="pay-recipient"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder={wallet.address ?? "Leave blank to pay yourself"}
            spellCheck={false}
          />
        </label>
        {recipientError && (
          <p className="alert" role="alert">
            {recipientError}
          </p>
        )}
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
        {shortSats !== null && wallet.address && (
          <ShortfallNotice who="This wallet" address={wallet.address} shortSats={shortSats} priceCents={price} />
        )}
        {message && (
          <p className="alert" role="alert">
            {message}
          </p>
        )}
        <button
          className="btn primary"
          type="button"
          disabled={busy || recipientError !== null}
          aria-busy={busy}
          onClick={() => void send()}
        >
          {busy
            ? "Waiting on the wallet…"
            : store.network === "mainnet"
              ? "Sign and broadcast on mainnet"
              : "Sign and broadcast on chipnet"}
        </button>
        <p className="muted">
          Locking script check uses {wallet.address ? "your connected address" : "the address you connect"}.{" "}
          {target && <span className="mono">{safe(target)}</span>}
        </p>
      </div>
    </div>
  );
}

function recipientProblem(recipient: string, network: "chipnet" | "mainnet"): string | null {
  const typed = recipient.trim();
  if (!typed) return null;
  try {
    assertAddressOnNetwork(typed, network);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "That address is not on this network.";
  }
}

function safe(address: string): string {
  try {
    lockingBytecodeForAddress(address);
    return address;
  } catch {
    return "Recipient is not a cashaddr yet.";
  }
}
