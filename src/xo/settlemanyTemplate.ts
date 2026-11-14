import type { XOTemplate } from "@xo-cash/types";

/**
 * Group settlement for Settlemany, in the XO template format accepted by
 * `@xo-cash/engine` 0.1.1-next.18029697917 (`parseTemplate` from the utils
 * build that engine pins, 0.0.10).
 *
 * One action, `settleGroup`, describes a single version-2 transaction. Every
 * debtor input is signed with `all_outputs_all_utxos` (SIGHASH_ALL | FORKID |
 * UTXOS, byte 0x61). Creditor outputs pay an exact amount to a locking script
 * the participants already have. The clerk assembles the invitation. Debtor
 * slots are unlimited: each debtor is a separate signer.
 *
 * `spendReceivedShare` is the creditor's follow-up once an output locked by
 * this template is theirs to spend. Paytaca addresses are ordinary P2PKH
 * scripts passed in by the app, so this follow-up is part of the contract
 * the debug tool can read. It does not run inside the Paytaca signing room.
 */
export const settlemanyTemplate: XOTemplate = {
  $schema: "https://libauth.org/schemas/wallet-template-v0.schema.json",
  name: "Settlemany group settlement",
  description:
    "Pay every creditor of a shared expense in one Bitcoin Cash transaction. Each debtor signs only their own inputs, and every signature commits to every input and every output.",
  icon: "send",
  version: "1",
  supported: ["BCH_2023_05", "BCH_2024_05", "BCH_2025_05", "BCH_2026_05"],
  resources: [
    {
      name: "Settlemany",
      description: "The group expense app this template was migrated from.",
      url: "https://github.com/Mzee04/settlemany",
    },
    {
      name: "XO stack",
      description: "Engine and template documentation used to build this contract.",
      url: "https://stack.xo.cash/",
    },
  ],
  roles: {
    clerk: {
      name: "Clerk",
      description: "Assembles the one settlement transaction and does not hold a debtor's wallet key.",
      icon: "user",
    },
    debtor: {
      name: "Debtor",
      description: "Pays their share by signing only the coins they own.",
      icon: "user",
    },
    creditor: {
      name: "Creditor",
      description: "Receives one exact payment.",
      icon: "user",
    },
  },
  variables: {
    memoText: {
      name: "Memo",
      description: "Short note carried on the settlement.",
      type: "string",
    },
    payeeLockingScript: {
      name: "Payee locking script",
      description: "Locking script that receives one exact creditor payment.",
      type: "locking_script",
    },
    payeeSatoshis: {
      name: "Payee satoshis",
      description: "Satoshis on one creditor payment.",
      type: "satoshis",
    },
    debtorKey: {
      name: "Debtor key",
      description: "Private key that can sign a debtor input when the signer is an XO wallet.",
      type: "private_key",
    },
  },
  constants: {
    dustLimit: {
      name: "Dust limit",
      description: "Minimum satoshis on a spendable Pay to Public Key Hash output.",
      type: "integer",
      value: 546,
    },
  },
  scripts: {
    lockToPayee: "$(<payeeLockingScript>)",
    lockP2PKH: "OP_DUP OP_HASH160 <$(<debtorKey.public_key> OP_HASH160)> OP_EQUALVERIFY OP_CHECKSIG",
    unlockP2PKH: "<debtorKey.schnorr_signature.all_outputs_all_utxos> <debtorKey.public_key>",
    memoScript: 'OP_RETURN <"Settlemany">',
  },
  lockingScripts: {
    payeeLock: {
      name: "Creditor payment",
      description: "Exact payment to a creditor address.",
      icon: "send",
      lockingType: "p2pkh",
      lockingBytecode: "lockToPayee",
      selectable: false,
      actions: [{ action: "spendReceivedShare", role: "creditor" }],
      roles: {
        creditor: {
          name: "Received",
          description: "Satoshis or tokens received from a group settlement.",
          actions: [{ action: "spendReceivedShare", role: "creditor" }],
          balance: { satoshis: true, fungibleTokens: true },
          selectable: true,
        },
      },
    },
    memoLock: {
      name: "Memo",
      description: "Unspendable note on the settlement.",
      icon: "send",
      lockingBytecode: "memoScript",
      selectable: false,
    },
    changeLock: {
      name: "Debtor change",
      description: "Satoshis or tokens returned to the debtor who funded an input.",
      icon: "receive",
      lockingType: "p2pkh",
      lockingBytecode: "lockToPayee",
      selectable: false,
    },
  },
  inputs: {
    debtorInput: {
      name: "Debtor coin",
      description: "A coin signed with a signature that commits to every input, output, and spent coin.",
      icon: "send",
      unlockingScript: "unlockP2PKH",
      sequenceNumber: 4294967295,
    },
  },
  outputs: {
    payeeOutput: {
      name: "Creditor payment",
      description: "Pays $(<payeeSatoshis>) satoshis to one creditor.",
      icon: "send",
      lockingScript: "payeeLock",
      valueSatoshis: "$(<payeeSatoshis>)",
    },
    changeOutput: {
      name: "Change",
      description: "Funds returned to a debtor.",
      icon: "receive",
      lockingScript: "changeLock",
    },
    memoOutput: {
      name: "Memo",
      description: "Carries a short note. It pays no one.",
      icon: "send",
      lockingScript: "memoLock",
      valueSatoshis: 0n,
    },
  },
  transactions: {
    groupSettlement: {
      name: "Group settled",
      description: "One transaction paid every creditor from every debtor.",
      icon: "send",
      version: 2,
      locktime: 0,
      composable: true,
      inputs: [{ input: "debtorInput" }],
      outputs: [{ output: "payeeOutput" }, { output: "changeOutput" }, { output: "memoOutput" }],
      roles: {
        debtor: {
          name: "Paid",
          description: "Signed only their own inputs.",
          inputs: [{ input: "debtorInput" }],
        },
        creditor: {
          name: "Received",
          description: "Received an exact payment.",
          outputs: [{ output: "payeeOutput" }],
        },
      },
    },
    spendReceived: {
      name: "Spent a received share",
      description: "A creditor spent satoshis they were paid by a group settlement.",
      icon: "send",
      version: 2,
      locktime: 0,
      inputs: [],
      outputs: [{ output: "payeeOutput" }],
    },
  },
  actions: {
    settleGroup: {
      name: "Settle the group",
      description: "Pay every creditor in one transaction. Each debtor signs only their own inputs.",
      icon: "send",
      transaction: "groupSettlement",
      roles: {
        clerk: { requirements: { variables: ["memoText"] } },
        debtor: { requirements: {} },
      },
      requirements: {
        participants: [
          { role: "clerk", slots: { min: 1, max: 1 } },
          { role: "debtor", slots: { min: 1 } },
        ],
      },
    },
    spendReceivedShare: {
      name: "Spend a received share",
      description: "Spend coins received from a group settlement.",
      icon: "send",
      transaction: "spendReceived",
      roles: {
        creditor: { requirements: {} },
      },
      requirements: {
        participants: [{ role: "creditor", slots: { min: 1, max: 1 } }],
      },
    },
  },
  start: [{ action: "settleGroup", role: "clerk" }],
  defaults: {
    change: { output: "changeOutput", role: "debtor" },
  },
};
