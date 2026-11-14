import { useEffect, useState } from "react";
import { PRIZE_ADDRESS, PRIZE_ADDRESS_IS_PLACEHOLDER } from "./config.ts";
import { DEMO_GROUP_ID } from "./domain/demo.ts";
import { useStore, StoreProvider } from "./state/store.tsx";
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
            <p className="kicker">EMBER2026 · prize CashTokens address</p>
            <p className="prize">
              <code className={PRIZE_ADDRESS_IS_PLACEHOLDER ? "placeholder" : undefined}>{PRIZE_ADDRESS}</code>
              <button
                className="btn ghost"
                type="button"
                onClick={() => void navigator.clipboard.writeText(PRIZE_ADDRESS)}
              >
                Copy
              </button>
            </p>
            {PRIZE_ADDRESS_IS_PLACEHOLDER && (
              <p className="muted" style={{ color: "#f0b429", margin: "0.3rem 0 0" }}>
                Replace PRIZE_ADDRESS in src/config.ts with your Paytaca address before you submit.
              </p>
            )}
          </div>
          <p className="event">Settlemany · BCH BLAZE 2026</p>
        </div>
      </header>
      <nav className="nav">
        <a className="wordmark" href="#/">
          Settlemany
        </a>
        <div className="nav-actions">
          <div className="seg" role="group" aria-label="Network">
            <button type="button" aria-pressed={store.network === "chipnet"} onClick={() => store.setNetwork("chipnet")}>
              Chipnet
            </button>
            <button type="button" aria-pressed={store.network === "mainnet"} onClick={() => store.setNetwork("mainnet")}>
              Mainnet
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
          Mainnet is on. Settlements and the $0.10 action spend real Bitcoin Cash.
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
