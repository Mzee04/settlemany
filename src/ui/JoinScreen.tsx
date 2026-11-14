import { useEffect, useState } from "react";
import { addressNetwork } from "../chain/address.ts";
import { decodePayload, encodePayload } from "../chain/envelope.ts";
import { useStore } from "../state/store.tsx";
import { pageUrl } from "./url.ts";

type Invite = {
  v: 1;
  kind: "invite" | "return";
  groupId: string;
  groupName: string;
  memberId: string;
  memberName: string;
  address?: string;
};

export function JoinScreen({ payload, returning }: { payload: string; returning: boolean }) {
  const store = useStore();
  const invite = decodePayload<Invite>(payload);
  const [address, setAddress] = useState(invite.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const group = store.groups.find((item) => item.id === invite.groupId);

  useEffect(() => {
    if (!returning || !invite.address || !group) return;
    const already = group.members.find((member) => member.id === invite.memberId)?.address === invite.address;
    if (already) {
      window.location.hash = `#/group/${group.id}`;
      return;
    }
    const members = group.members.some((member) => member.id === invite.memberId)
      ? group.members.map((member) =>
          member.id === invite.memberId ? { ...member, address: invite.address ?? "", demoKeyLabel: null } : member,
        )
      : [...group.members, { id: invite.memberId, name: invite.memberName, address: invite.address, demoKeyLabel: null }];
    store.saveGroup({ ...group, members });
    window.location.hash = `#/group/${group.id}`;
  }, [returning, invite, group, store]);

  if (returning && invite.address && !group) {
    return (
      <div className="page">
        <h1>Address ready</h1>
        <p>
          {invite.memberName} set <span className="mono">{invite.address}</span> for {invite.groupName}. Open this link
          in the browser that already has the group.
        </p>
      </div>
    );
  }
  if (returning && invite.address) return <p className="page">Saving the address…</p>;

  return (
    <div className="page">
      <h1>Join {invite.groupName}</h1>
      <p className="lede">{invite.memberName}, paste the CashTokens address that should receive or send on this ledger.</p>
      <label className="field">
        <span>CashTokens address</span>
        <input value={address} onChange={(event) => setAddress(event.target.value)} spellCheck={false} autoCapitalize="off" />
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn primary"
        type="button"
        onClick={() => {
          try {
            addressNetwork(address.trim());
            const next = encodePayload({ ...invite, kind: "return", address: address.trim() });
            setLink(pageUrl(`#/return/${next}`));
            setError(null);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "That address is not valid.");
          }
        }}
      >
        Create the return link
      </button>
      {link && (
        <p>
          Send this back to the person who keeps the ledger.
          <br />
          <a href={link}>Open return link</a>
        </p>
      )}
    </div>
  );
}
