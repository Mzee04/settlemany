import { sameCashaddr } from "../chain/address.ts";

export type UnsignedDebtor = {
  ownerId: string;
  name: string;
  address: string;
};

export type SignerMatch =
  | { status: "clear" }
  | { status: "disconnected" }
  | { status: "ready"; names: string[] }
  | { status: "mismatch"; unsigned: UnsignedDebtor[] };

type PacketInput = { index: number; ownerId: string; ownerName: string };

/** Debtors who still have at least one unsigned input, in input order. */
export function unsignedDebtors(
  inputs: PacketInput[],
  addresses: Record<string, string>,
  signed: ReadonlySet<number>,
): UnsignedDebtor[] {
  const owners = [...new Set(inputs.map((input) => input.ownerId))];
  return owners.flatMap((ownerId) => {
    const mine = inputs.filter((input) => input.ownerId === ownerId);
    if (mine.length === 0 || mine.every((input) => signed.has(input.index))) return [];
    return [
      {
        ownerId,
        name: mine[0]?.ownerName ?? ownerId,
        address: addresses[ownerId] ?? "",
      },
    ];
  });
}

export function matchConnectedSigner(
  connectedAddress: string | null | undefined,
  unsigned: UnsignedDebtor[],
): SignerMatch {
  if (unsigned.length === 0) return { status: "clear" };
  const connected = connectedAddress?.trim() ?? "";
  if (!connected) return { status: "disconnected" };
  const ready = unsigned.filter((debtor) => debtor.address.trim() !== "" && sameCashaddr(connected, debtor.address));
  if (ready.length > 0) return { status: "ready", names: ready.map((debtor) => debtor.name) };
  return { status: "mismatch", unsigned };
}

export function readyToSignText(names: string[]): string {
  if (names.length === 1) return `This is ${names[0]}, ready to sign.`;
  if (names.length === 2) return `This is ${names[0]} and ${names[1]}, ready to sign.`;
  const rest = names.slice(0, -1).join(", ");
  return `This is ${rest}, and ${names[names.length - 1]}, ready to sign.`;
}

export function debtorNeedPhrase(debtor: UnsignedDebtor): {
  text: string;
  before: string;
  address: string | null;
  after: string;
} {
  const address = debtor.address.trim();
  if (!address) {
    const text = `${debtor.name} needs an address in People`;
    return { text, before: text, address: null, after: "" };
  }
  const before = `${debtor.name} needs to sign from `;
  return { text: `${before}${address}`, before, address, after: "" };
}

/** Closing sentence for a mismatch. Null when the only debtor has no address yet. */
export function mismatchTail(unsigned: UnsignedDebtor[]): string | null {
  if (unsigned.length === 1 && !unsigned[0]?.address.trim()) return null;
  if (unsigned.length === 1) {
    return `Reconnect with that address, or update ${unsigned[0]?.name}'s address in People.`;
  }
  return "Reconnect with one of those addresses, or update their addresses in People.";
}

export function mismatchWarning(unsigned: UnsignedDebtor[]): string {
  const details = unsigned.map((debtor) => debtorNeedPhrase(debtor).text).join(". ");
  const tail = mismatchTail(unsigned);
  if (!tail) return `Connected wallet is not any unsigned debtor. ${details}.`;
  return `Connected wallet is not any unsigned debtor. ${details}. ${tail}`;
}

export function disconnectedHint(unsigned: UnsignedDebtor[]): string {
  const details = unsigned.map((debtor) => debtorNeedPhrase(debtor).text).join(". ");
  const tail = unsigned.length === 1 ? "Connect that wallet before you sign." : "Connect one of those wallets before you sign.";
  return `${details}. ${tail}`;
}

export function connectedAddressLabel(name: string): string {
  return `Use connected address for ${name}`;
}
