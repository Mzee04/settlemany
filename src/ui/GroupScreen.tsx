import { useState, type FormEvent } from "react";
import { addressNetwork, type NetworkId } from "../chain/address.ts";
import { encodePayload } from "../chain/envelope.ts";
import { CURRENCIES, foreignMinorToUsdCents } from "../domain/price.ts";
import { fetchUsdRates } from "../chain/prices.ts";
import { memberName, openTransfers, rawBalances, type Expense, type Group, type Member } from "../domain/ledger.ts";
import { formatUsd } from "../domain/money.ts";
import { splitExpense, type SplitMode, type SplitPart } from "../domain/split.ts";
import { uid, useStore } from "../state/store.tsx";

export function GroupScreen({ group, editing }: { group: Group; editing: boolean }) {
  const store = useStore();
  const balances = rawBalances(group);
  const net = openTransfers(group);
  const [error, setError] = useState<string | null>(null);

  function save(next: Group) {
    store.saveGroup(next);
  }

  return (
    <div className="page">
      <p className="muted">
        <a href="#/">All groups</a>
      </p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{group.name}</h1>
          <p className="lede">{group.story}</p>
        </div>
        <a className="btn primary" href={`#/group/${group.id}/settle`}>
          Settle
        </a>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Who is owed</h2>
        <p className="muted">Positive means the group owes them. Figures are USD cents, after any settlement already broadcast.</p>
        <table className="ledger">
          <thead>
            <tr>
              <th>Person</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.memberId}>
                <td data-label="Person">{balance.name}</td>
                <td data-label="Balance" className={balance.cents > 0 ? "pos" : balance.cents < 0 ? "neg" : ""}>
                  {balance.cents === 0 ? "Settled" : formatUsd(balance.cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {net.transfers.length === 0 ? (
          <p>Nothing open. Add an expense, or this group is already even.</p>
        ) : (
          <>
            <h3>Fewest payments</h3>
            <ul>
              {net.transfers.map((transfer) => (
                <li key={`${transfer.fromId}-${transfer.toId}-${transfer.amountCents}`}>
                  {memberName(group, transfer.fromId)} pays {memberName(group, transfer.toId)}{" "}
                  <strong>{formatUsd(transfer.amountCents)}</strong>
                </li>
              ))}
            </ul>
            <p className="muted">{net.exact ? "This is a minimum set of payments." : "A short deterministic plan. The group is large enough that the full search stopped early."}</p>
          </>
        )}
      </section>

      <Members group={group} network={store.network} onChange={save} onError={setError} />
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <Expenses group={group} onChange={save} />
      {editing && <ExpenseForm group={group} onChange={save} />}
      {!editing && (
        <p style={{ marginTop: "1rem" }}>
          <a className="btn" href={`#/group/${group.id}/expense`}>
            Add an expense
          </a>
        </p>
      )}
    </div>
  );
}

function Members({
  group,
  network,
  onChange,
  onError,
}: {
  group: Group;
  network: NetworkId;
  onChange: (group: Group) => void;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState("");

  function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const member: Member = { id: uid("m"), name: name.trim(), address: "", demoKeyLabel: null };
    onChange({ ...group, members: [...group.members, member] });
    setName("");
  }

  function patch(memberId: string, address: string) {
    onError(null);
    const trimmed = address.trim();
    if (trimmed) {
      try {
        addressNetwork(trimmed);
      } catch (error) {
        onError(error instanceof Error ? error.message : "That address is not valid.");
        return;
      }
    }
    onChange({
      ...group,
      members: group.members.map((member) =>
        member.id === memberId ? { ...member, address: trimmed, demoKeyLabel: null } : member,
      ),
    });
  }

  return (
    <section className="card" style={{ marginTop: "1rem" }}>
      <h2>People</h2>
      <p className="muted">
        Paste a CashTokens address, or send an invite link so they add their own. The current toggle is {network}. An
        address from the other network is kept, and settlement will ask you to switch.
      </p>
      {group.members.map((member) => (
        <div key={member.id} className="field">
          <span>{member.name}</span>
          <input
            aria-label={`${member.name} CashTokens address`}
            value={member.address}
            placeholder={network === "chipnet" ? "bchtest:…" : "bitcoincash:…"}
            onChange={(event) => patch(member.id, event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
          />
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                const payload = encodePayload({
                  v: 1,
                  kind: "invite",
                  groupId: group.id,
                  groupName: group.name,
                  memberId: member.id,
                  memberName: member.name,
                });
                void navigator.clipboard.writeText(`${location.origin}${location.pathname}#/join/${payload}`);
              }}
            >
              Copy invite link
            </button>
            {!member.address && <span className="muted">Waiting for an address</span>}
          </div>
        </div>
      ))}
      <form onSubmit={add} className="row">
        <label className="field" style={{ flex: "1 1 16rem", margin: 0 }}>
          <span>Add a person</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
        </label>
        <button className="btn" type="submit">
          Add
        </button>
      </form>
    </section>
  );
}

function Expenses({ group, onChange }: { group: Group; onChange: (group: Group) => void }) {
  return (
    <section className="card" style={{ marginTop: "1rem" }}>
      <h2>Expenses</h2>
      {group.expenses.length === 0 && <p>No expenses yet.</p>}
      <table className="ledger">
        <thead>
          <tr>
            <th>Note</th>
            <th>Paid by</th>
            <th>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {group.expenses.map((expense) => (
            <tr key={expense.id}>
              <td data-label="Note">
                {expense.memo}
                <div className="muted">{expense.splitMode}</div>
              </td>
              <td data-label="Paid by">{memberName(group, expense.payerId)}</td>
              <td data-label="Amount">
                {formatUsd(expense.usdCents)}
                {expense.currency !== "USD" && (
                  <div className="muted">
                    {(expense.amountCents / 100).toFixed(2)} {expense.currency}
                  </div>
                )}
              </td>
              <td data-label="">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => onChange({ ...group, expenses: group.expenses.filter((item) => item.id !== expense.id) })}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            const header = ["memo", "payer", "currency", "amount", "usd"];
            const rows = group.expenses.map((expense) => [
              expense.memo,
              memberName(group, expense.payerId),
              expense.currency,
              (expense.amountCents / 100).toFixed(2),
              (expense.usdCents / 100).toFixed(2),
            ]);
            const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${group.name.replace(/\s+/g, "-").toLowerCase()}-expenses.csv`;
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export CSV
        </button>
      </p>
    </section>
  );
}

function ExpenseForm({ group, onChange }: { group: Group; onChange: (group: Group) => void }) {
  const [memo, setMemo] = useState("");
  const [payerId, setPayerId] = useState(group.members[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [included, setIncluded] = useState<Record<string, boolean>>(
    Object.fromEntries(group.members.map((member) => [member.id, true])),
  );
  const [shares, setShares] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadRate() {
    try {
      const rates = await fetchUsdRates();
      const value = rates[currency];
      if (!value) throw new Error("That currency is not in the rate feed. Type how many units equal 1 USD.");
      setRate((value / 100_000_000).toString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load rates.");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (group.members.length === 0) throw new Error("Add a person before an expense.");
      const cents = parseMoney(amount);
      if (cents === null || cents <= 0) throw new Error("Enter an amount like 12.50");
      const people = group.members.filter((member) => included[member.id] !== false);
      const parts = buildParts(mode, people.map((member) => member.id), shares, amounts, percents);
      splitExpense(cents, mode, parts);
      let usdCents = cents;
      let fxNote = "Entered in USD";
      if (currency !== "USD") {
        const numeric = Number(rate);
        if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("Enter how many units of that currency equal 1 USD.");
        usdCents = foreignMinorToUsdCents(cents, Math.round(numeric * 100_000_000));
        fxNote = `1 USD = ${numeric} ${currency}`;
      }
      const expense: Expense = {
        id: uid("exp"),
        memo: memo.trim(),
        payerId,
        amountCents: cents,
        currency,
        usdCents,
        fxNote,
        splitMode: mode,
        parts,
        createdAt: new Date().toISOString(),
      };
      if (!expense.memo) throw new Error("Add a short note.");
      onChange({ ...group, expenses: [...group.expenses, expense] });
      window.location.hash = `#/group/${group.id}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add that expense.");
    }
  }

  const preview = previewShares(amount, mode, group, included, shares, amounts, percents);

  return (
    <section className="card" style={{ marginTop: "1rem" }}>
      <h2>Add an expense</h2>
      <form onSubmit={submit}>
        <label className="field">
          <span>Note</span>
          <input value={memo} onChange={(event) => setMemo(event.target.value)} required placeholder="Groceries" />
        </label>
        <label className="field">
          <span>Who paid?</span>
          <select value={payerId} onChange={(event) => setPayerId(event.target.value)}>
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Amount</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required />
          </label>
          <label className="field">
            <span>Currency</span>
            <select
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
                setRate("");
              }}
            >
              {CURRENCIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {currency !== "USD" && (
          <label className="field">
            <span>How many {currency} equal 1 USD?</span>
            <input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" />
            <button className="btn ghost" type="button" onClick={() => void loadRate()}>
              Load today’s rate
            </button>
          </label>
        )}
        <div className="seg" role="group" aria-label="Split">
          {(["equal", "shares", "amounts", "percent"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </div>
        <div style={{ marginTop: "0.8rem" }}>
          {group.members.map((member) => (
            <div key={member.id} className="row" style={{ marginBottom: "0.4rem" }}>
              <label>
                <input
                  type="checkbox"
                  checked={included[member.id] !== false}
                  onChange={(event) => setIncluded({ ...included, [member.id]: event.target.checked })}
                />{" "}
                {member.name}
              </label>
              {mode === "shares" && (
                <input
                  aria-label={`${member.name} shares`}
                  style={{ maxWidth: "6rem" }}
                  value={shares[member.id] ?? "1"}
                  onChange={(event) => setShares({ ...shares, [member.id]: event.target.value })}
                />
              )}
              {mode === "amounts" && (
                <input
                  aria-label={`${member.name} exact amount`}
                  style={{ maxWidth: "8rem" }}
                  value={amounts[member.id] ?? ""}
                  onChange={(event) => setAmounts({ ...amounts, [member.id]: event.target.value })}
                />
              )}
              {mode === "percent" && (
                <input
                  aria-label={`${member.name} percent`}
                  style={{ maxWidth: "6rem" }}
                  value={percents[member.id] ?? ""}
                  onChange={(event) => setPercents({ ...percents, [member.id]: event.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        {preview && <p className="muted">{preview}</p>}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="submit">
          Save expense
        </button>
      </form>
    </section>
  );
}

function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

function buildParts(
  mode: SplitMode,
  memberIds: string[],
  shares: Record<string, string>,
  amounts: Record<string, string>,
  percents: Record<string, string>,
): SplitPart[] {
  return memberIds.map((memberId) => {
    if (mode === "shares") return { memberId, shares: Number(shares[memberId] ?? "1") };
    if (mode === "amounts") return { memberId, amountCents: parseMoney(amounts[memberId] ?? "0") ?? 0 };
    if (mode === "percent") return { memberId, percentBps: Math.round(Number(percents[memberId] ?? "0") * 100) };
    return { memberId };
  });
}

function previewShares(
  amount: string,
  mode: SplitMode,
  group: Group,
  included: Record<string, boolean>,
  shares: Record<string, string>,
  amounts: Record<string, string>,
  percents: Record<string, string>,
): string | null {
  const cents = parseMoney(amount);
  if (cents === null) return null;
  try {
    const ids = group.members.filter((member) => included[member.id] !== false).map((member) => member.id);
    const parts = buildParts(mode, ids, shares, amounts, percents);
    const rows = splitExpense(cents, mode, parts);
    return rows.map((row) => `${memberName(group, row.memberId)} ${formatUsd(row.cents)}`).join(" · ");
  } catch (error) {
    return error instanceof Error ? error.message : null;
  }
}
