import { useMemo, useState } from "react";
import { binToHex } from "@bitauth/libauth";
import { coinsForAddress, withElectrum, broadcast } from "../chain/electrum.ts";
import { decodePayload, encodePayload } from "../chain/envelope.ts";
import { packetTransaction, replaceTransaction, settlementToPacket, type SigningPacket } from "../chain/packet.ts";
import { buildSettlement, type SpendableCoin } from "../chain/settle.ts";
import { signedIndexes, verifySettlement } from "../chain/sign.ts";
import { staleInputIndexes } from "../chain/stale.ts";
import { formatUsd } from "../domain/money.ts";
import { receiptPayments } from "../domain/receipt.ts";
import { useStore } from "../state/store.tsx";
import { CopyButton, QrCode } from "./bits.tsx";
import { pageUrl } from "./url.ts";
import { useWallet } from "./wallet.tsx";
import { assertAddressOnNetwork, lockingBytecodeForAddress } from "../chain/address.ts";
import { ConnectedSignerStatus } from "./ConnectedSigner.tsx";
import { unsignedDebtors } from "./signerMatch.ts";
import { signWithWallet } from "../chain/wallet.ts";
import { coordinatorMnemonic, existingCoordinatorMnemonic } from "../xo/coordinator.ts";
import { applyWalletUnlocks, compileSettlementInvitation, recordInvitationResult } from "../xo/settleInvitation.ts";

export function SignScreen({ payload }: { payload: string }) {
  const store = useStore();
  const wallet = useWallet();
  const initial = useMemo(() => {
    try {
      return decodePayload<SigningPacket>(payload);
    } catch {
      return null;
    }
  }, [payload]);
  const [packet, setPacket] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = packet;
  if (!initial || !active) {
    return (
      <div className="page">
        <p className="alert" role="alert">
          This signing link could not be read. Ask for a fresh one.
        </p>
      </div>
    );
  }
  const live: SigningPacket = active;

  let view: ReturnType<typeof packetTransaction> | null = null;
  let broken = "";
  try {
    view = packetTransaction(live);
  } catch (error) {
    broken = error instanceof Error ? error.message : "This signing link is damaged.";
  }
  if (!view) {
    return (
      <div className="page">
        <p className="alert" role="alert">
          {broken}
        </p>
      </div>
    );
  }

  const done = new Set(signedIndexes(view.transaction));
  const owners = [...new Set(live.inputs.map((input) => input.ownerId))];
  const finishedOwners = owners.filter((ownerId) =>
    live.inputs.filter((input) => input.ownerId === ownerId).every((input) => done.has(input.index)),
  );

  async function signMine() {
    if (!wallet.manager || !wallet.address) {
      setMessage("Connect the wallet that holds this debtor’s coins.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const mine = lockingBytecodeForAddress(wallet.address);
      const mineHex = binToHex(mine);
      const indexes = view!.transaction.inputs.flatMap((_, index) => {
        const source = view!.sourceOutputs[index];
        if (!source || done.has(index)) return [];
        return binToHex(source.lockingBytecode) === mineHex ? [index] : [];
      });
      if (indexes.length === 0) {
        throw new Error("This wallet does not hold any unsigned input on this transaction.");
      }
      const signed = await signWithWallet({
        manager: wallet.manager,
        transaction: view!.transaction,
        sourceOutputs: view!.sourceOutputs,
        inputIndexes: indexes,
        prompt: `Sign only your inputs for ${live.groupName}. Settlemany will broadcast after every debtor has signed.`,
      });
      const next = replaceTransaction(live, signed);
      const mnemonic = existingCoordinatorMnemonic();
      if (next.builder === "xo" && next.xoInvitation && mnemonic) {
        next.xoInvitation = applyWalletUnlocks({
          invitation: next.xoInvitation,
          transaction: signed,
          network: next.network,
          coordinationMnemonic: mnemonic,
        });
      }
      setPacket(next);
      const link = pageUrl(`#/sign/${encodePayload(next)}`);
      window.location.hash = `#/sign/${encodePayload(next)}`;
      setMessage("Signed. If someone else still has to sign, send them the updated link.");
      void navigator.clipboard.writeText(link).catch(() => undefined);
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "The wallet did not sign."} You can pay your share instead — that transaction spends only your coins.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      const current = packetTransaction(live);
      if (signedIndexes(current.transaction).length !== current.transaction.inputs.length) {
        throw new Error("Someone still has to sign.");
      }
      const verified = verifySettlement(current.transaction, current.sourceOutputs);
      if (verified !== true) throw new Error(typeof verified === "string" ? verified : "The transaction does not verify.");
      const txid = await withElectrum(live.network, async (client) => {
        const unspent: { txid: string; vout: number }[] = [];
        const ownersSeen = [...new Set(live.inputs.map((input) => input.ownerId))];
        for (const ownerId of ownersSeen) {
          const address = live.addresses[ownerId];
          if (!address) continue;
          const coins = await coinsForAddress(client, address, ownerId);
          unspent.push(...coins.map((coin) => ({ txid: coin.txid, vout: coin.vout })));
        }
        const stale = staleInputIndexes(current.transaction, unspent);
        if (stale.length > 0) {
          throw new Error("A coin in this transaction was already spent. Create a new signing link from the group so everyone can sign again.");
        }
        return broadcast(client, live.txHex);
      });
      let xoInvitation = live.xoInvitation ?? null;
      const mnemonic = existingCoordinatorMnemonic();
      if (live.builder === "xo" && xoInvitation && mnemonic) {
        try {
          xoInvitation = applyWalletUnlocks({
            invitation: xoInvitation,
            transaction: current.transaction,
            network: live.network,
            coordinationMnemonic: mnemonic,
          });
          xoInvitation = recordInvitationResult({
            invitation: xoInvitation,
            network: live.network,
            coordinationMnemonic: mnemonic,
            broadcasted: true,
          });
        } catch {
          // The broadcast already succeeded. Keep the invitation from the build.
        }
      }
      const group = store.groups.find((item) => item.id === live.groupId);
      if (group) {
        store.saveGroup({
          ...group,
          settled: [
            ...group.settled,
            ...live.legs.map((leg) => ({
              id: `${txid}:${leg.fromId}:${leg.toId}`,
              fromId: leg.fromId,
              toId: leg.toId,
              usdCents: leg.usdCents,
              txid,
              asset: live.asset,
              network: live.network,
              demo: false,
              memo: live.memo,
              createdAt: new Date().toISOString(),
            })),
          ],
        });
      }
      window.location.hash = `#/receipt/${encodePayload({
        title: live.groupName,
        memo: live.memo,
        network: live.network,
        asset: live.asset,
        txid,
        verified: "Every signature checked out and Settlemany broadcast it",
        broadcast: true,
        demo: false,
        feeSats: live.feeSats,
        createdAt: new Date().toISOString(),
        payments: receiptPayments({
          date: new Date().toISOString(),
          group: live.groupName,
          network: live.network,
          asset: live.asset,
          feeSats: live.feeSats,
          txid,
          legs: live.legs.map((leg) => ({
            fromName: leg.fromName,
            toName: leg.toName,
            fromAddress: live.addresses[leg.fromId] ?? "",
            toAddress: live.addresses[leg.toId] ?? "",
            usdCents: leg.usdCents,
            amount: leg.amount,
          })),
        }),
        lines: live.legs.map((leg) => `${leg.fromName} paid ${leg.toName} ${formatUsd(leg.usdCents)}`),
        note: live.builder === "xo" ? "Built with the Settlemany XO template. Paytaca signed the inputs." : "",
        xoInvitation,
      })}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Broadcast failed.");
    } finally {
      setBusy(false);
    }
  }

  async function rebuild(options?: { addresses?: Record<string, string>; success?: string }) {
    setBusy(true);
    setMessage(null);
    const addresses = options?.addresses ?? live.addresses;
    try {
      const coins = await withElectrum(live.network, async (client) => {
        const found: SpendableCoin[] = [];
        for (const ownerId of owners) {
          const address = addresses[ownerId];
          if (!address) continue;
          found.push(...(await coinsForAddress(client, address, ownerId)));
        }
        return found;
      });
      const built = buildSettlement({
        network: live.network,
        asset: live.asset,
        tokenCategoryHex: live.tokenCategoryHex ?? undefined,
        transfers: live.legs.map((leg) => ({ fromId: leg.fromId, toId: leg.toId, amount: BigInt(leg.amount) })),
        addresses,
        coins,
        memo: live.memo,
      });
      const names = Object.fromEntries(live.inputs.map((input) => [input.ownerId, input.ownerName]));
      for (const leg of live.legs) names[leg.toId] = leg.toName;
      const useXo = live.builder === "xo";
      const mnemonic = useXo ? (existingCoordinatorMnemonic() ?? coordinatorMnemonic()) : null;
      const xoInvitation = useXo && mnemonic
        ? compileSettlementInvitation({
            built,
            network: live.network,
            memo: live.memo,
            coordinationMnemonic: mnemonic,
          }).invitation
        : null;
      const next = settlementToPacket({
        built,
        names,
        groupId: live.groupId,
        groupName: live.groupName,
        network: live.network,
        asset: live.asset,
        tokenCategoryHex: live.tokenCategoryHex,
        memo: live.memo,
        legs: live.legs,
        addresses,
        demo: false,
        builder: useXo && xoInvitation ? "xo" : "classic",
        xoInvitation,
      });
      if (options?.addresses && live.groupId) {
        const group = store.groups.find((item) => item.id === live.groupId);
        if (group) {
          const overrides = options.addresses;
          store.saveGroup({
            ...group,
            members: group.members.map((member) =>
              overrides[member.id] && overrides[member.id] !== member.address
                ? { ...member, address: overrides[member.id] ?? member.address, demoKeyLabel: null }
                : member,
            ),
          });
        }
      }
      setPacket(next);
      window.location.hash = `#/sign/${encodePayload(next)}`;
      setMessage(options?.success ?? "Rebuilt without the spent coins. Earlier signatures no longer apply, so everyone signs again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rebuild.");
    } finally {
      setBusy(false);
    }
  }

  async function applyConnectedAddress(ownerId: string) {
    if (!wallet.address) {
      setMessage("Connect the wallet first.");
      return;
    }
    try {
      assertAddressOnNetwork(wallet.address, live.network);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That address is not on this settlement’s network.");
      return;
    }
    const name = live.inputs.find((input) => input.ownerId === ownerId)?.ownerName ?? ownerId;
    await rebuild({
      addresses: { ...live.addresses, [ownerId]: wallet.address.trim() },
      success: `Updated ${name} to the connected address and rebuilt the transaction. Earlier signatures no longer apply, so everyone signs again.`,
    });
  }

  const link = pageUrl(`#/sign/${encodePayload(live)}`);
  const unsigned = unsignedDebtors(live.inputs, live.addresses, done);
  const localGroup = live.groupId ? store.groups.find((item) => item.id === live.groupId) : undefined;

  return (
    <div className="page">
      <h1>{live.groupName}</h1>
      <p className="lede">
        {finishedOwners.length} of {owners.length} debtors have signed.{" "}
        {live.asset === "pusd" ? "Token settlement." : "BCH settlement."} {live.network}.
        {live.builder === "xo" ? " Encoded with XO. Paytaca signs your inputs." : ""}
      </p>
      <ul>
        {owners.map((ownerId) => (
          <li key={ownerId}>
            {live.inputs.find((input) => input.ownerId === ownerId)?.ownerName}{" "}
            {finishedOwners.includes(ownerId) ? "signed" : "still needs to sign"}
          </li>
        ))}
      </ul>
      <ul>
        {live.legs.map((leg) => (
          <li key={`${leg.fromId}-${leg.toId}`}>
            {leg.fromName} pays {leg.toName} {formatUsd(leg.usdCents)}
          </li>
        ))}
      </ul>
      <ConnectedSignerStatus
        connectedAddress={wallet.address}
        unsigned={unsigned}
        peopleHref={localGroup ? `#/group/${localGroup.id}` : undefined}
        busy={busy}
        onUseConnected={(ownerId) => void applyConnectedAddress(ownerId)}
      />
      <div className="row">
        <button className="btn primary" type="button" disabled={busy} onClick={() => void signMine()}>
          Sign my inputs
        </button>
        <button className="btn" type="button" disabled={busy || finishedOwners.length !== owners.length} onClick={() => void publish()}>
          Broadcast
        </button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => void rebuild()}>
          Coins moved — rebuild
        </button>
      </div>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Updated link</h2>
        <QrCode value={link} />
        <CopyButton value={link} label="Copy link" />
        <p className="muted">SIGHASH_ALL means a signature dies if anyone changes an output or swaps a coin. That is why a rebuild needs fresh signatures.</p>
      </section>
    </div>
  );
}
