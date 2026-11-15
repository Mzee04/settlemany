// Headless Settlemany XO settle on chipnet.
// Usage: XO_KEYS=keys.secret.json XO_PLAN=plan.json node scripts/xo-chipnet-settle.ts [--broadcast]
// keys.secret.json: { "coordinatorMnemonic": "...", "chipnetDebtors": { "<id>": { "privateKeyHex": "..." } } } (never commit it)
import { readFileSync, writeFileSync } from "node:fs";
import { hexToBin, secp256k1, binToHex } from "@bitauth/libauth";
import { addressFromLockingBytecode, p2pkhLockingBytecode, lockingBytecodeForAddress } from "../src/chain/address.ts";
import { buildSettlement, transactionHex, type SpendableCoin } from "../src/chain/settle.ts";
import { signOwners, transactionId, verifySettlement } from "../src/chain/sign.ts";
import { applyWalletUnlocks, compileSettlementInvitation, invitationTransaction, recordInvitationResult } from "../src/xo/settleInvitation.ts";
import { SETTLEMANY_TEMPLATE_IDENTIFIER } from "../src/xo/settlemanyTemplate.ts";

const cfg = JSON.parse(readFileSync(process.env.XO_KEYS ?? "keys.secret.json", "utf8"));
const debtorKeys: Record<string, Uint8Array> = {};
const addresses: Record<string, string> = {};
for (const [id, d] of Object.entries<any>(cfg.chipnetDebtors)) {
  debtorKeys[id] = hexToBin(d.privateKeyHex);
  const pub = secp256k1.derivePublicKeyCompressed(debtorKeys[id]) as Uint8Array;
  addresses[id] = addressFromLockingBytecode(p2pkhLockingBytecode(pub), "chipnet");
}
const plan = JSON.parse(readFileSync(process.env.XO_PLAN ?? "plan.json", "utf8"));
Object.assign(addresses, plan.creditors);
const coins: SpendableCoin[] = plan.coins.map((c: any) => ({
  txid: c.txid, vout: c.vout, satoshis: BigInt(c.sats), lockingBytecode: lockingBytecodeForAddress(addresses[c.ownerId]),
  tokenAmount: 0n, tokenCategoryHex: null, ownerId: c.ownerId,
}));
const transfers = plan.transfers.map((t: any) => ({ fromId: t.fromId, toId: t.toId, amount: BigInt(t.amount) }));
const built = buildSettlement({ network: "chipnet", asset: "bch", transfers, addresses, coins, memo: plan.memo });
const compiled = compileSettlementInvitation({ built, network: "chipnet", memo: plan.memo, coordinationMnemonic: cfg.coordinatorMnemonic });
writeFileSync("invitation.unsigned.json", compiled.invitation);
let invitation = compiled.invitation;
// Each debtor signs only their own inputs, one at a time, like separate wallets.
for (const id of Object.keys(debtorKeys)) {
  const tx = invitationTransaction(invitation);
  const signed = signOwners({ transaction: tx, sourceOutputs: built.sourceOutputs, inputOwners: built.inputOwners, keys: { [id]: debtorKeys[id] }, onlyOwnerId: id });
  invitation = applyWalletUnlocks({ invitation, transaction: signed, network: "chipnet", coordinationMnemonic: cfg.coordinatorMnemonic });
}
const finalTx = invitationTransaction(invitation);
const ok = verifySettlement(finalTx, built.sourceOutputs); if (ok !== true) throw new Error("verify: " + ok);
const hex = transactionHex(finalTx);
const txid = transactionId(finalTx);
console.log("template", SETTLEMANY_TEMPLATE_IDENTIFIER, "fee", built.feeSats.toString(), "bytes", hex.length / 2, "txid", txid);
invitation = recordInvitationResult({ invitation, network: "chipnet", coordinationMnemonic: cfg.coordinatorMnemonic, broadcasted: false });
writeFileSync("tx.hex", hex);
if (process.argv.includes("--broadcast")) {
  const res = await fetch("https://chipnet.watchtower.cash/api/broadcast/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transaction: hex }) });
  const body = await res.text();
  console.log("broadcast", res.status, body.slice(0, 300));
  if (!res.ok || !body.includes("true")) process.exit(1);
  invitation = recordInvitationResult({ invitation, network: "chipnet", coordinationMnemonic: cfg.coordinatorMnemonic, broadcasted: true });
}
writeFileSync("invitation.json", invitation);
console.log("wrote invitation.json", invitation.length, "chars");
