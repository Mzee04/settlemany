import { useState } from "react";
import { PUSD_CATEGORY_CHIPNET, PUSD_CATEGORY_MAINNET } from "../config.ts";
import { addressNetwork, assertAddressOnNetwork } from "../chain/address.ts";
import { coinsForAddress, withElectrum } from "../chain/electrum.ts";
import { encodePayload } from "../chain/envelope.ts";
import { settlementToPacket, type PacketLeg, type SigningPacket } from "../chain/packet.ts";
import { replaceTransaction } from "../chain/packet.ts";
import { buildSettlement, SettleError, type SpendableCoin } from "../chain/settle.ts";
import { signOwners, transactionId, verifySettlement } from "../chain/sign.ts";
import { memberName, openTransfers, type Group } from "../domain/ledger.ts";
import { formatBch, formatToken, formatUsd } from "../domain/money.ts";
import { receiptPayments } from "../domain/receipt.ts";
import { useStore } from "../state/store.tsx";
import { CopyButton, QrCode } from "./bits.tsx";
import { pageUrl } from "./url.ts";
import { chainAmount, DEMO_TOKEN_CATEGORY, demoKeys, pretendCoins } from "./plan.ts";

export function SettleScreen({ group }: { group: Group }) {
  const store = useStore();
  const net = openTransfers(group);
  const [asset, setAsset] = useState<"bch" | "pusd">("bch");
  const [priceText, setPriceText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [packet, setPacket] = useState<SigningPacket | null>(null);
  const typedPrice = Number(priceText);
  const priceCents = priceText.trim()
    ? Math.round(typedPrice * 100)
    : (store.priceCents ?? 0);

  const names = Object.fromEntries(group.members.map((member) => [member.id, member.name]));
  const addresses = Object.fromEntries(group.members.map((member) => [member.id, member.address]));
  const mismatched = group.members.filter((member) => {
    const address = member.address.trim();
    if (!address) return false;
    try {
      return addressNetwork(address) !== store.network;
    } catch {
      return true;
    }
  });

  function legs(): PacketLeg[] {
    return net.transfers.map((transfer) => ({
      fromId: transfer.fromId,
      toId: transfer.toId,
      fromName: memberName(group, transfer.fromId),
      toName: memberName(group, transfer.toId),
      usdCents: transfer.amountCents,
      amount: chainAmount(transfer.amountCents, asset, priceCents).toString(),
    }));
  }

  function requirePrice() {
    if (asset === "bch" && (!Number.isFinite(priceCents) || priceCents <= 0)) {
      throw new Error("Enter a BCH price in USD, or wait for the live price.");
    }
  }

  async function simulate() {
    setBusy(true);
    setMessage(null);
    try {
      requirePrice();
      if (net.transfers.length === 0) throw new Error("Nothing to settle.");
      const keys = demoKeys(group);
      for (const transfer of net.transfers) {
        if (!keys[transfer.fromId]) {
          throw new Error(`${memberName(group, transfer.fromId)} is not using a demo key, so this browser cannot sign for them.`);
        }
      }
      const network = addressNetwork(group.members.find((member) => member.address)?.address ?? "");
      const category = asset === "pusd" ? DEMO_TOKEN_CATEGORY : null;
      const coins = pretendCoins({
        group,
        transfers: net.transfers,
        asset,
        network,
        categoryHex: category ?? DEMO_TOKEN_CATEGORY,
        priceCents: asset === "bch" ? priceCents : 1,
      });
      const built = buildSettlement({
        network,
        asset,
        tokenCategoryHex: category ?? undefined,
        transfers: net.transfers.map((transfer) => ({
          fromId: transfer.fromId,
          toId: transfer.toId,
          amount: chainAmount(transfer.amountCents, asset, priceCents),
        })),
        addresses,
        coins,
        memo: group.name,
      });
      const signed = signOwners({
        transaction: built.transaction,
        sourceOutputs: built.sourceOutputs,
        inputOwners: built.inputOwners,
        keys,
      });
      const verified = verifySettlement(signed, built.sourceOutputs);
      const made = replaceTransaction(
        settlementToPacket({
          built,
          names,
          groupId: group.id,
          groupName: group.name,
          network,
          asset,
          tokenCategoryHex: category,
          memo: group.name,
          legs: legs(),
          addresses,
          demo: true,
        }),
        signed,
      );
      const txid = transactionId(signed);
      window.location.hash = `#/receipt/${encodePayload({
        title: group.name,
        memo: made.memo,
        network,
        asset,
        txid,
        verified: verified === true ? "Valid on the Bitcoin Cash virtual machine" : String(verified),
        broadcast: false,
        demo: true,
        feeSats: made.feeSats,
        createdAt: new Date().toISOString(),
        payments: receiptPayments({
          date: new Date().toISOString(),
          group: group.name,
          network,
          asset,
          feeSats: made.feeSats,
          txid,
          legs: made.legs.map((leg) => ({
            fromName: leg.fromName,
            toName: leg.toName,
            fromAddress: made.addresses[leg.fromId] ?? "",
            toAddress: made.addresses[leg.toId] ?? "",
            usdCents: leg.usdCents,
            amount: leg.amount,
          })),
        }),
        lines: made.legs.map((leg) => `${leg.fromName} pays ${leg.toName} ${formatUsd(leg.usdCents)}`),
        note:
          asset === "pusd"
            ? "Simulated test CashToken. This is not mainnet PUSD, and it was not broadcast."
            : "Signed with public demo keys. Not broadcast.",
      })}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Simulation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function buildLive(onlyFromId?: string) {
    setBusy(true);
    setMessage(null);
    try {
      requirePrice();
      const chosen = onlyFromId ? net.transfers.filter((transfer) => transfer.fromId === onlyFromId) : net.transfers;
      if (chosen.length === 0) throw new Error("Nothing to settle.");
      const category = store.network === "mainnet" ? PUSD_CATEGORY_MAINNET : PUSD_CATEGORY_CHIPNET;
      if (asset === "pusd" && !category) {
        throw new Error("Chipnet has no canonical PUSD. Settle in BCH here, or switch to mainnet if the wallet holds PUSD.");
      }
      for (const transfer of chosen) {
        for (const id of [transfer.fromId, transfer.toId]) {
          if (!addresses[id]) throw new Error(`${names[id] ?? id} still needs a CashTokens address.`);
          assertAddressOnNetwork(addresses[id], store.network);
        }
      }
      const ownerIds = [...new Set(chosen.map((transfer) => transfer.fromId))];
      const coins = await withElectrum(store.network, async (client) => {
        const found: SpendableCoin[] = [];
        for (const ownerId of ownerIds) {
          found.push(...(await coinsForAddress(client, addresses[ownerId]!, ownerId)));
        }
        return found;
      });
      const built = buildSettlement({
        network: store.network,
        asset,
        tokenCategoryHex: category || undefined,
        transfers: chosen.map((transfer) => ({
          fromId: transfer.fromId,
          toId: transfer.toId,
          amount: chainAmount(transfer.amountCents, asset, priceCents),
        })),
        addresses,
        coins,
        memo: group.name,
      });
      const made = settlementToPacket({
        built,
        names,
        groupId: group.id,
        groupName: group.name,
        network: store.network,
        asset,
        tokenCategoryHex: asset === "pusd" ? category : null,
        memo: group.name,
        legs: chosen.map((transfer) => ({
          fromId: transfer.fromId,
          toId: transfer.toId,
          fromName: names[transfer.fromId] ?? transfer.fromId,
          toName: names[transfer.toId] ?? transfer.toId,
          usdCents: transfer.amountCents,
          amount: chainAmount(transfer.amountCents, asset, priceCents).toString(),
        })),
        addresses,
        demo: false,
      });
      setPacket(made);
      setMessage(onlyFromId ? `Signing link ready for ${names[onlyFromId]}.` : "Signing link ready. Each debtor opens it and signs only their inputs.");
    } catch (error) {
      const text = error instanceof SettleError ? error.message : error instanceof Error ? error.message : "Could not build the transaction.";
      setMessage(text);
    } finally {
      setBusy(false);
    }
  }

  const link = packet ? pageUrl(`#/sign/${encodePayload(packet)}`) : "";

  return (
    <div className="page">
      <p className="muted">
        <a href={`#/group/${group.id}`}>{group.name}</a>
      </p>
      <h1>Settle in one transaction</h1>
      <p className="lede">
        {net.transfers.length === 0
          ? "This ledger is even."
          : `${net.transfers.length} payment${net.transfers.length === 1 ? "" : "s"}. Creditors receive the exact amount. Fees come out of the debtors’ change.`}
      </p>
      <div className="row" style={{ margin: "0.8rem 0" }}>
        <div className="seg" role="group" aria-label="Asset">
          <button type="button" aria-pressed={asset === "bch"} onClick={() => setAsset("bch")}>
            BCH
          </button>
          <button type="button" aria-pressed={asset === "pusd"} onClick={() => setAsset("pusd")}>
            PUSD
          </button>
        </div>
        <span className="muted">Network: {store.network === "mainnet" ? "mainnet (real BCH)" : "chipnet test"}</span>
      </div>
      {store.network === "mainnet" && (
        <p className="alert warn" role="status">
          Use a tiny dollar amount. This spends real Bitcoin Cash.
        </p>
      )}
      {mismatched.length > 0 && (
        <p className="alert" role="alert">
          Mainnet will not pay a bchtest address and chipnet will not pay a bitcoincash address.
        </p>
      )}
      {asset === "bch" && (
        <label className="field">
          <span>BCH price in USD · {store.priceMessage}</span>
          <input
            value={priceText}
            placeholder={store.priceCents ? (store.priceCents / 100).toFixed(2) : "450.00"}
            onChange={(event) => setPriceText(event.target.value)}
            inputMode="decimal"
          />
        </label>
      )}
      {asset === "pusd" && (
        <p className="muted">
          PUSD uses 2 decimals, so one dollar cent is one token unit. Category{" "}
          <span className="mono">{store.network === "mainnet" ? PUSD_CATEGORY_MAINNET : PUSD_CATEGORY_CHIPNET || "none on chipnet"}</span>
        </p>
      )}
      <ul>
        {net.transfers.map((transfer) => {
          const amount = Number.isFinite(priceCents) && priceCents > 0 ? chainAmount(transfer.amountCents, asset, priceCents) : 0n;
          return (
            <li key={`${transfer.fromId}-${transfer.toId}`}>
              {memberName(group, transfer.fromId)} → {memberName(group, transfer.toId)} · {formatUsd(transfer.amountCents)}
              {asset === "bch" && priceCents > 0 ? ` · ${formatBch(amount)}` : ""}
              {asset === "pusd" ? ` · ${formatToken(BigInt(transfer.amountCents), "PUSD")}` : ""}
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button className="btn primary" type="button" disabled={busy || net.transfers.length === 0} onClick={() => void simulate()}>
          Simulate the one transaction
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy || net.transfers.length === 0 || mismatched.length > 0}
          onClick={() => void buildLive()}
        >
          Build a real signing link
        </button>
      </div>
      <p className="muted">
        Simulation uses public demo keys and pretend coins, then checks the result in libauth. It is not broadcast. The
        real link asks each debtor’s wallet to sign only their inputs, with broadcast left off until everyone has signed.
      </p>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {packet && (
        <section className="card">
          <h2>Pass this around</h2>
          <p>Each debtor opens the link, connects the wallet that holds their address, and signs. Send the updated link back.</p>
          <QrCode value={link} />
          {link.length > 1800 && <p className="muted">This QR is dense. Copy the link if a phone cannot scan it.</p>}
          <div className="row">
            <CopyButton value={link} label="Copy signing link" />
            <a className="btn" href={`#/sign/${encodePayload(packet)}`}>
              Open the signing room
            </a>
          </div>
        </section>
      )}
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Pay your share</h2>
        <p>
          If a wallet refuses a transaction that spends someone else’s coins, each debtor can pay their own creditors in a
          separate transaction. The amounts stay exact. You just lose the “one transaction” part.
        </p>
        <div className="row">
          {[...new Set(net.transfers.map((transfer) => transfer.fromId))].map((fromId) => (
            <button
              key={fromId}
              className="btn ghost"
              type="button"
              disabled={busy || mismatched.length > 0}
              onClick={() => void buildLive(fromId)}
            >
              {names[fromId]} pays their share
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

