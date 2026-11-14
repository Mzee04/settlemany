import { useEffect, useState } from "react";
import { PRIZE_ADDRESS, PUBLIC_REPO_URL, WIDGET_FACTORY_SLIDES_URL } from "./config.ts";
import { DEMO_GROUP_ID } from "./domain/demo.ts";
import { useStore, StoreProvider } from "./state/store.tsx";
import { QrCode } from "./ui/bits.tsx";
import { GroupScreen } from "./ui/GroupScreen.tsx";
import { Home } from "./ui/Home.tsx";
import { JoinScreen } from "./ui/JoinScreen.tsx";
import { PayScreen } from "./ui/PayScreen.tsx";
import { ReceiptScreen } from "./ui/ReceiptScreen.tsx";
import { SettleScreen } from "./ui/SettleScreen.tsx";
import { SignScreen } from "./ui/SignScreen.tsx";
import { WalletButton, WalletProvider } from "./ui/wallet.tsx";

function parse(hash: string) {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  const head = parts[0] ?? "";
  const payload = parts.slice(1).join("/");
  if (head === "pay") return { name: "pay" as const };
  if (head === "group" && parts[1]) return { name: (parts[2] === "settle" ? "settle" : parts[2] === "expense" ? "expense" : "group") as "group" | "settle" | "expense", id: parts[1] };
  if ((head === "sign" || head === "receipt" || head === "join" || head === "return") && payload) {
    return { name: head, payload };
  }
  return { name: "home" as const };
}

export default function App() {
  return (
    <StoreProvider>
      <Frame />
    </StoreProvider>
  );
}

function Frame() {
  const store = useStore();
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  const [showPrizeQr, setShowPrizeQr] = useState(false);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const route = parse(hash);
  const group = "id" in route ? store.groups.find((item) => item.id === route.id) : undefined;

  return (
    <WalletProvider network={store.network}>
      <a className="skip" href="#content">
        Skip to the ledger
      </a>
      <header className="banner">
        <div className="banner-stripe" aria-hidden="true" />
        <div className="banner-body">
          <div>
            <p className="kicker">BCH BLAZE 2026 entry</p>
            <p className="banner-links">
              <a href={WIDGET_FACTORY_SLIDES_URL} target="_blank" rel="noreferrer">
                Slides
              </a>
              <a href={PUBLIC_REPO_URL} target="_blank" rel="noreferrer">
                Code
              </a>
            </p>
            <p className="prize">
              <span>Vote with EMBER2026:</span>
              <code>{PRIZE_ADDRESS}</code>
              <button className="btn ghost" type="button" onClick={() => void navigator.clipboard.writeText(PRIZE_ADDRESS)}>
                Copy vote address
              </button>
              <button
                className="btn ghost"
                type="button"
                aria-pressed={showPrizeQr}
                onClick={() => setShowPrizeQr((open) => !open)}
              >
                {showPrizeQr ? "Hide QR" : "QR"}
              </button>
            </p>
            {showPrizeQr && <QrCode value={PRIZE_ADDRESS} />}
            <p className="banner-built">Built during BCH BLAZE (from 14 Nov 2026).</p>
          </div>
        </div>
      </header>
      <nav className="nav">
        <a className="wordmark" href="#/">
          Settlemany
        </a>
        <div className="nav-actions">
          <div className="seg" role="group" aria-label="Network">
            <button type="button" aria-pressed={store.network === "mainnet"} onClick={() => store.setNetwork("mainnet")}>
              Mainnet
            </button>
            <button type="button" aria-pressed={store.network === "chipnet"} onClick={() => store.setNetwork("chipnet")}>
              Chipnet test
            </button>
          </div>
          <a className="btn ghost" href={`#/group/${DEMO_GROUP_ID}`}>
            Demo
          </a>
          <WalletButton />
        </div>
      </nav>
      {store.network === "mainnet" && (
        <p className="alert warn" style={{ margin: 0, borderRadius: 0 }} role="status">
          Mainnet is on. This spends real Bitcoin Cash. Use a tiny amount for a first test.
        </p>
      )}
      <main id="content">
        {route.name === "home" && <Home />}
        {route.name === "pay" && <PayScreen />}
        {(route.name === "group" || route.name === "expense") &&
          (group ? <GroupScreen group={group} editing={route.name === "expense"} /> : <Missing />)}
        {route.name === "settle" && (group ? <SettleScreen group={group} /> : <Missing />)}
        {route.name === "sign" && <SignScreen payload={route.payload} />}
        {route.name === "receipt" && <ReceiptScreen payload={route.payload} />}
        {(route.name === "join" || route.name === "return") && (
          <JoinScreen payload={route.payload} returning={route.name === "return"} />
        )}
      </main>
      <footer className="site">
        The ledger stays in this browser. Signing links carry the transaction itself. MIT licensed. No private keys are
        shipped except the public demo phrase, which must never hold funds.
      </footer>
    </WalletProvider>
  );
}

function Missing() {
  return (
    <div className="page">
      <h1>That group is not on this browser</h1>
      <p>
        <a href="#/">Go home</a> or restore the demo from there.
      </p>
    </div>
  );
}
