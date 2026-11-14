import type { XOTemplate } from "@xo-cash/types";
import { generateTemplateIdentifier, parseTemplate } from "@xo-cash/utils";

/**
 * Group settlement on the XO template format published by @xo-cash/utils.
 *
 * One action, `settleGroup`, describes a single version-2 transaction: every
 * debtor input and every creditor output. The debtor unlock names
 * `schnorr_signature.all_outputs_all_utxos` (sighash 0x61). A creditor who was
 * paid to the template's own receive script can later run `spendReceivedSettlement`.
 * Paytaca addresses are external locking bytecode, so that follow-up is not
 * offered on coins the engine did not generate. See `settleInvitation.ts`.
 */
const draft = {
  $schema: "https://libauth.org/schemas/wallet-template-v0.schema.json",
  name: "Settlemany group settlement",
  description:
    "Pay every creditor of a group in one Bitcoin Cash transaction. Each debtor signs only the coins they spend, and every signature commits to every input and every output.",
  icon: "settle",
  version: "1",
  supported: ["BCH_2023_05", "BCH_2024_05", "BCH_2025_05", "BCH_2026_05"],
  roles: {
    coordinator: {
      name: "Coordinator",
      description: "The person who assembles the settlement and names what each creditor is paid.",
      icon: "coordinator",
    },
    debtor: {
      name: "Debtor",
      description: "A person who owes the group and signs the coins they spend.",
      icon: "debtor",
    },
    creditor: {
      name: "Creditor",
      description: "A person the group pays. They do not sign this settlement.",
      icon: "creditor",
    },
  },
  start: [
    {
      action: "settleGroup",
      role: "coordinator",
    },
  ],
  actions: {
    settleGroup: {
      name: "Settle the group",
      description: "Pay every creditor the exact amount in one transaction.",
      icon: "settle",
      roles: {
        coordinator: {
          name: "Assemble the settlement",
          description: "Name the memo and the outputs that pay each creditor.",
          icon: "coordinator",
          requirements: {
            variables: ["settlementMemo"],
          },
        },
        debtor: {
          name: "Sign your coins",
          description: "Sign only the inputs you own. The signature covers every input and every output.",
          icon: "debtor",
          requirements: {
            secrets: ["debtorKey"],
          },
        },
      },
      requirements: {
        participants: [
          { role: "coordinator", slots: { min: 1, max: 1 } },
          { role: "debtor", slots: { min: 0 } },
        ],
      },
      transaction: "groupSettlementTransaction",
    },
    spendReceivedSettlement: {
      name: "Spend what you were paid",
      description: "Spend Bitcoin Cash you received from a group settlement.",
      icon: "send",
      roles: {
        creditor: {
          name: "Spend the payment",
          description: "Spend coins locked to the settlement receive script.",
          icon: "creditor",
          requirements: {
            secrets: ["creditorKey"],
          },
        },
      },
      requirements: {
        participants: [{ role: "creditor", slots: { min: 1, max: 1 } }],
      },
      transaction: "spendReceivedTransaction",
    },
  },
  transactions: {
    groupSettlementTransaction: {
      name: "Group settled",
      description: "Paid every creditor in one transaction.",
      icon: "settle",
      version: 2,
      locktime: 0,
      inputs: [{ input: "debtorInput" }],
      outputs: [
        { output: "creditorPayment" },
        { output: "debtorChange" },
        { output: "settlementMemo" },
      ],
    },
    spendReceivedTransaction: {
      name: "Settlement spent",
      description: "Spent Bitcoin Cash received from a group settlement.",
      icon: "send",
      version: 2,
      locktime: 0,
      inputs: [{ input: "receivedSettlementInput" }],
      outputs: [{ output: "onwardPayment" }],
    },
  },
  inputs: {
    debtorInput: {
      name: "Debtor coin",
      description: "A coin the debtor signs with a signature that commits to the whole settlement.",
      icon: "debtor",
      unlockingScript: "unlockDebtorInput",
      sequenceNumber: 4294967295,
    },
    receivedSettlementInput: {
      name: "Received settlement",
      description: "The payment output a creditor spends after the group settlement.",
      icon: "creditor",
      unlockingScript: "unlockReceivedSettlement",
    },
  },
  outputs: {
    creditorPayment: {
      name: "Creditor payment",
      description: "The exact amount a creditor is paid.",
      icon: "creditor",
      lockingScript: "payCreditor",
      token: null,
    },
    debtorChange: {
      name: "Debtor change",
      description: "Satoshis or tokens returned to the debtor who spent the coin.",
      icon: "debtor",
      lockingScript: "payDebtorChange",
      token: null,
    },
    settlementMemo: {
      name: "Settlement memo",
      description: "A short note carried in an OP_RETURN output.",
      icon: "memo",
      lockingScript: "memoScript",
      valueSatoshis: 0n,
    },
    onwardPayment: {
      name: "Onward payment",
      description: "Where a creditor sends coins they were paid.",
      icon: "send",
      lockingScript: "payCreditor",
    },
  },
  lockingScripts: {
    payCreditor: {
      name: "Pay a creditor",
      description: "Locks the payment to the creditor address named for this output.",
      icon: "creditor",
      lockingType: "p2s",
      lockingBytecode: "payCreditorBytecode",
    },
    payDebtorChange: {
      name: "Return change",
      description: "Locks change to the debtor address named for this output.",
      icon: "debtor",
      lockingType: "p2s",
      lockingBytecode: "payDebtorChangeBytecode",
    },
    memoScript: {
      name: "Memo",
      description: "An unspendable note. The settlement commit supplies the OP_RETURN bytecode.",
      icon: "memo",
      lockingType: "p2s",
      lockingBytecode: "memoBytecode",
    },
    receivedSettlement: {
      name: "Settlement received",
      description: "Bitcoin Cash received from a group settlement, spendable by the creditor key.",
      icon: "creditor",
      lockingType: "p2pkh",
      lockingBytecode: "lockReceivedSettlement",
      unlockingBytecode: "unlockReceivedSettlement",
      selectable: true,
      roles: {
        creditor: {
          name: "Creditor",
          description: "The person who can spend this payment.",
          state: {
            variables: [],
            secrets: ["creditorKey"],
          },
          actions: [
            {
              action: "spendReceivedSettlement",
              role: "creditor",
              secrets: [{ creditorKey: null }],
            },
          ],
          balance: {
            satoshis: true,
            fungibleTokens: true,
          },
          selectable: true,
        },
      },
    },
  },
  scripts: {
    payCreditorBytecode: "$(<creditorLockingBytecode>)",
    payDebtorChangeBytecode: "$(<debtorLockingBytecode>)",
    memoBytecode: "$(<memoLockingBytecode>)",
    lockReceivedSettlement: "OP_DUP OP_HASH160 <$(<creditorKey.public_key> OP_HASH160)> OP_EQUALVERIFY OP_CHECKSIG",
    unlockReceivedSettlement: "<creditorKey.schnorr_signature.all_outputs_all_utxos> <creditorKey.public_key>",
    unlockDebtorInput: "<debtorKey.schnorr_signature.all_outputs_all_utxos> <debtorKey.public_key>",
  },
  constants: {
    dustLimit: {
      name: "Dust limit",
      description: "Minimum satoshis for a pay-to-public-key-hash output.",
      type: "integer",
      value: 546,
    },
  },
  variables: {
    settlementMemo: {
      name: "Memo",
      description: "Short note stored with the settlement.",
      type: "string",
    },
    creditorLockingBytecode: {
      name: "Creditor locking bytecode",
      description: "Locking bytecode of the creditor who is paid.",
      type: "locking_script",
    },
    debtorLockingBytecode: {
      name: "Debtor locking bytecode",
      description: "Locking bytecode that receives the debtor's change.",
      type: "locking_script",
    },
    memoLockingBytecode: {
      name: "Memo bytecode",
      description: "OP_RETURN bytecode carrying the settlement note.",
      type: "bytes",
    },
    debtorKey: {
      name: "Debtor key",
      description: "Key that signs the debtor's coins. Paytaca holds this key; the engine does not.",
      type: "private_key",
    },
    creditorKey: {
      name: "Creditor key",
      description: "Key that can spend a payment locked by this template's receive script.",
      type: "private_key",
    },
  },
  resources: [
    {
      name: "Settlemany",
      description: "The group expense app this template was migrated from.",
      url: "https://github.com/Mzee04/settlemany",
    },
    {
      name: "XO stack",
      description: "XO documentation from General Protocols.",
      url: "https://stack.xo.cash/",
    },
  ],
  icons: [
    { name: "settle", hash: "0000000000000000000000" },
    { name: "coordinator", hash: "0000000000000000000000" },
    { name: "debtor", hash: "0000000000000000000000" },
    { name: "creditor", hash: "0000000000000000000000" },
    { name: "memo", hash: "0000000000000000000000" },
    { name: "send", hash: "0000000000000000000000" },
  ],
} as unknown as XOTemplate;

export const settlemanyTemplate: XOTemplate = deepFreeze(parseTemplate(draft));

/**
 * Wallet extensions often set `BigInt.prototype.toJSON` to a decimal string.
 * `JSON.stringify` calls that before XO's replacer, so the template hash flips
 * from the `<bigint: 0n>` form to the string `"0"`. Hash and sign while a
 * canonical toJSON is installed, then put the previous one back.
 */
export function withCanonicalBigIntJson<T>(run: () => T): T {
  const proto = BigInt.prototype as unknown as { toJSON?: () => string };
  const previous = proto.toJSON;
  proto.toJSON = function canonicalBigIntJson(this: bigint) {
    return `<bigint: ${this.toString()}n>`;
  };
  try {
    return run();
  } finally {
    if (previous === undefined) delete proto.toJSON;
    else proto.toJSON = previous;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const SETTLEMANY_TEMPLATE_IDENTIFIER = withCanonicalBigIntJson(() =>
  generateTemplateIdentifier(settlemanyTemplate),
);

export const SETTLE_GROUP_ACTION = "settleGroup";

export const SPEND_RECEIVED_ACTION = "spendReceivedSettlement";
