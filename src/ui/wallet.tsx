import { WizardConnectQRDialog } from "@wizardconnect/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { useWizardConnect } from "@wizardconnect/react";
import { addressFromLockingBytecode, p2pkhLockingBytecode, type NetworkId } from "../chain/address.ts";
import { CopyButton } from "./bits.tsx";

type WalletApi = {
  state: string;
  walletName: string | null;
  address: string | null;
  network: NetworkId;
  manager: DappConnectionManager | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
};

function shortenAddress(address: string): string {
  const colon = address.indexOf(":");
  if (colon < 0) return address.length > 16 ? `${address.slice(0, 12)}…` : address;
  const prefix = address.slice(0, colon);
  const payload = address.slice(colon + 1);
  if (payload.length <= 12) return address;
  return `${prefix}:${payload.slice(0, 6)}…${payload.slice(-4)}`;
}

const Ctx = createContext<WalletApi | null>(null);

export function WalletProvider({ network, children }: { network: NetworkId; children: ReactNode }) {
  const wc = useWizardConnect({ dappName: "Settlemany" });
  const [address, setAddress] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (wc.state !== "connected" || !wc.manager) {
      setAddress(null);
      return;
    }
    const pubkey = wc.manager.getPubkey(0, 0n);
    if (!pubkey) {
      setAddress(null);
      return;
    }
    setAddress(addressFromLockingBytecode(p2pkhLockingBytecode(pubkey), network));
  }, [wc.state, wc.manager, network]);

  useEffect(() => {
    if (wc.state === "connected") setOpen(false);
  }, [wc.state]);

  const api: WalletApi = {
    state: wc.state,
    walletName: wc.walletName,
    address,
    network,
    manager: wc.manager,
    error: wc.error,
    connect: () => {
      setOpen(true);
      wc.connect();
    },
    disconnect: () => {
      void wc.disconnect();
    },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <WizardConnectQRDialog
        show={open && Boolean(wc.uri && wc.qrUri)}
        onClose={() => setOpen(false)}
        uri={wc.uri ?? ""}
        qrUri={wc.qrUri ?? ""}
        title="Connect a wallet"
        subtitle="Scan with Paytaca or Selene. Match the chipnet or mainnet toggle before you sign."
        theme={{
          dialogBackground: "#1b1612",
          headerBackground: "#1b1612",
          titleColor: "#f6efe4",
          subtitleColor: "#d9c8b6",
          qrForeground: "#1b1612",
          qrBackground: "#fffaf3",
          borderColor: "#3a2e24",
        }}
      />
    </Ctx.Provider>
  );
}

export function useWallet(): WalletApi {
  const wallet = useContext(Ctx);
  if (!wallet) throw new Error("Wallet missing");
  return wallet;
}

export function WalletButton() {
  const wallet = useWallet();
  const [pinned, setPinned] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const address = wallet.address;
  const open = address !== null && pinned === address;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPinned(null);
    }
    function onPointer(event: PointerEvent) {
      const slot = slotRef.current;
      if (!slot || !(event.target instanceof Node) || slot.contains(event.target)) return;
      setPinned(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!address) {
    return (
      <button className="btn" type="button" onClick={wallet.connect}>
        {wallet.state === "connecting" ? "Waiting for wallet…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className={open ? "wallet-slot open" : "wallet-slot"} ref={slotRef}>
      <button
        className="btn ghost wallet-pill"
        type="button"
        aria-expanded={open}
        aria-controls="wallet-panel"
        aria-haspopup="true"
        onClick={() => setPinned((current) => (current === address ? null : address))}
      >
        <span className="wallet-pill-label">
          {wallet.walletName ?? "Wallet"} · {shortenAddress(address)}
        </span>
        <span className="wallet-show">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div id="wallet-panel" className="wallet-panel" role="region" aria-label="Connected wallet">
          <h2>Connected address</h2>
          <p className="muted">{wallet.walletName ?? "Wallet"}</p>
          <p className="wallet-network">{wallet.network}</p>
          <p className="mono wallet-address">{address}</p>
          <div className="row">
            <CopyButton value={address} label="Copy" />
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setPinned(null);
                wallet.disconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
