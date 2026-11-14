import { useState } from "react";
import { createDemoGroup, DEMO_GROUP_ID } from "../domain/demo.ts";
import { memberName, openTransfers, rawBalances } from "../domain/ledger.ts";
import { formatUsd } from "../domain/money.ts";
import { useStore } from "../state/store.tsx";

export function Home() {
  const store = useStore();
  const demo = createDemoGroup();
  const balances = rawBalances(demo);
  const { transfers } = openTransfers(demo);
  const [name, setName] = useState("");
  const [story, setStory] = useState("");
  const hasDemo = store.groups.some((group) => group.id === DEMO_GROUP_ID);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="kicker" style={{ color: "var(--ember)" }}>
            Mainnet track · one transaction
          </p>
          <h1>The whole group, settled in one Bitcoin Cash transaction.</h1>
          <p className="lede">
            Settlemany keeps a trip, a flat, or a team in dollars. It nets who owes whom, then builds a single
            transaction. Each debtor signs only their own inputs. Creditors are paid exactly, in PUSD or in BCH.
          </p>
          <div className="row" style={{ marginTop: "1rem" }}>
            <a className="btn primary" href={`#/group/${DEMO_GROUP_ID}`}>
              Open the demo group
            </a>
            <a className="btn" href="#/pay">
              Send a real $0.10
            </a>
          </div>
        </div>
        <aside className="card">
          <h2>Eko Atlantic weekend</h2>
          <p className="muted">Already filled in. Three payments, one creditor, one transaction.</p>
          <ul>
            {transfers.map((transfer) => (
              <li key={`${transfer.fromId}-${transfer.toId}-${transfer.amountCents}`}>
                {memberName(demo, transfer.fromId)} pays {memberName(demo, transfer.toId)}{" "}
                <strong>{formatUsd(transfer.amountCents)}</strong>
              </li>
            ))}
          </ul>
          <p className="muted">
            {balances
              .filter((balance) => balance.cents > 0)
              .map((balance) => `${balance.name} is owed ${formatUsd(balance.cents)}`)
              .join(". ")}
            .
          </p>
        </aside>
      </section>

      <section className="grid-3" style={{ marginTop: "1.2rem" }}>
        <article className="card">
          <p className="step-no">1</p>
          <h3>Write it in dollars</h3>
          <p>Equal splits, shares, exact amounts, or percents. Other currencies are snapshotted into USD cents.</p>
        </article>
        <article className="card">
          <p className="step-no">2</p>
          <h3>Net the room</h3>
          <p>Integer cents, the fewest transfers, the same answer every time. A cycle that already cancels disappears.</p>
        </article>
        <article className="card">
          <p className="step-no">3</p>
          <h3>Close it once</h3>
          <p>
            One transaction, SIGHASH_ALL so nobody can change the outputs later. If a wallet cannot sign beside
            someone else’s inputs, that person pays their share alone.
          </p>
        </article>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Start a group</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            const id = store.createGroup(name, story);
            window.location.hash = `#/group/${id}`;
          }}
        >
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Flat 4B" />
          </label>
          <label className="field">
            <span>What is this for?</span>
            <input value={story} onChange={(event) => setStory(event.target.value)} placeholder="Rent, food, the odd taxi" />
          </label>
          <button className="btn primary" type="submit">
            Create the group
          </button>
        </form>
        {!hasDemo && (
          <p>
            <button className="btn ghost" type="button" onClick={store.restoreDemo}>
              Restore the demo group
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
