import { CopyButton } from "./bits.tsx";
import {
  debtorNeedPhrase,
  disconnectedHint,
  matchConnectedSigner,
  mismatchTail,
  readyToSignText,
  connectedAddressLabel,
  type UnsignedDebtor,
} from "./signerMatch.ts";

function PeopleTail({ tail, peopleHref }: { tail: string; peopleHref?: string }) {
  if (!peopleHref) return <>{tail}</>;
  const at = tail.lastIndexOf("People");
  if (at < 0) return <>{tail}</>;
  return (
    <>
      {tail.slice(0, at)}
      <a href={peopleHref}>People</a>
      {tail.slice(at + "People".length)}
    </>
  );
}

function DebtorNeed({ debtor }: { debtor: UnsignedDebtor }) {
  const phrase = debtorNeedPhrase(debtor);
  if (!phrase.address) return <>{phrase.text}</>;
  return (
    <>
      {phrase.before}
      <span className="mono">{phrase.address}</span>
      {phrase.after}
    </>
  );
}

export function ConnectedSignerStatus({
  connectedAddress,
  unsigned,
  peopleHref,
  busy,
  onUseConnected,
}: {
  connectedAddress: string | null;
  unsigned: UnsignedDebtor[];
  peopleHref?: string;
  busy: boolean;
  onUseConnected: (ownerId: string) => void;
}) {
  const match = matchConnectedSigner(connectedAddress, unsigned);
  const tail = match.status === "mismatch" ? mismatchTail(match.unsigned) : null;

  return (
    <section className="card signer-wallet" aria-label="Connected wallet">
      {connectedAddress ? (
        <div className="wallet-connected">
          <span>Connected wallet:</span>
          <span className="mono">{connectedAddress}</span>
          <CopyButton value={connectedAddress} label="Copy" />
        </div>
      ) : (
        <p>Connected wallet: not connected.</p>
      )}
      {match.status === "ready" && (
        <p className="alert ok" role="status">
          {readyToSignText(match.names)}
        </p>
      )}
      {match.status === "mismatch" && (
        <div className="alert warn" role="status">
          <p>
            Connected wallet is not any unsigned debtor.{" "}
            {match.unsigned.map((debtor) => (
              <span key={debtor.ownerId}>
                <DebtorNeed debtor={debtor} />.{" "}
              </span>
            ))}
            {tail && <PeopleTail tail={tail} peopleHref={peopleHref} />}
          </p>
          <p className="muted">This saves the address in People when the group is on this browser, then rebuilds the signing link.</p>
          <div className="row signer-actions">
            {match.unsigned.map((debtor) => (
              <button
                key={debtor.ownerId}
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => onUseConnected(debtor.ownerId)}
              >
                {connectedAddressLabel(debtor.name)}
              </button>
            ))}
          </div>
        </div>
      )}
      {match.status === "disconnected" && <p className="muted">{disconnectedHint(unsigned)}</p>}
    </section>
  );
}
