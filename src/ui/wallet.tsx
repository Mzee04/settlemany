import { WizardConnectQRDialog } from "@wizardconnect/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DappConnectionManager } from "@wizardconnect/dapp";
import { useWizardConnect } from "@wizardconnect/react";
import { addressFromLockingBytecode, p2pkhLockingBytecode, type NetworkId } from "../chain/address.ts";

type WalletApi = {
  state: string;
  walletName: string | null;
  address: string | null;
  manager: DappConnectionManager | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
};

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
  if (wallet.address) {
    return (
      <button className="btn ghost" type="button" onClick={wallet.disconnect}>
        {wallet.walletName ?? "Wallet"} · {wallet.address.slice(0, 12)}… · Disconnect
      </button>
    );
  }
  return (
    <button className="btn" type="button" onClick={wallet.connect}>
      {wallet.state === "connecting" ? "Waiting for wallet…" : "Connect wallet"}
    </button>
  );
}
