import { p2pkhTemplate } from "@xo-cash/templates";

type JsonRecord = Record<string, unknown>;

/**
 * XO / libauth wallet template for a Settlemany payment.
 *
 * It is the P2PKH settlement leg: a debtor pays an exact satoshi amount, or an
 * exact fungible CashToken amount (PUSD uses 2 decimals), to a creditor locking
 * script. The unlocking script asks for SIGHASH_ALL|FORKID|UTXOS so the
 * signature commits to every input and output. Settlemany composes one of these
 * legs per debtor into a single transaction; each wallet signs only its inputs.
 */
export function createSettlemanyTemplate(): JsonRecord {
  const template = JSON.parse(JSON.stringify(p2pkhTemplate)) as JsonRecord;
  template.name = "Settlemany settlement";
  template.description =
    "Pay an exact share of a group debt on Bitcoin Cash. Debtors sign only their own inputs, and every signature commits to the full transaction.";
  template.icon = "send";
  const scripts = template.scripts as JsonRecord;
  scripts.unlockP2PKH = "<ownerKey.schnorr_signature.all_outputs_all_utxos> <ownerKey.public_key>";
  const actions = template.actions as JsonRecord;
  const sendSatoshis = actions.sendSatoshis as JsonRecord;
  const sendTokens = actions.sendFungibleTokens as JsonRecord;
  actions.settleSatoshis = {
    ...sendSatoshis,
    name: "Settle in Bitcoin Cash",
    description: "Pay your exact share of a group settlement in satoshis.",
  };
  actions.settleFungibleTokens = {
    ...sendTokens,
    name: "Settle in a CashToken",
    description: "Pay your exact share of a group settlement in a fungible CashToken such as PUSD.",
  };
  return template;
}

export const settlemanyTemplate = createSettlemanyTemplate();
