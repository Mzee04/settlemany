# Settlemany XO chipnet proof

A group settlement made through Settlemany's XO flow on BCH chipnet, with an inspectable XO invitation.

## Transaction

- Chipnet txid: `4b5b5e9bacfdc967148248609faa9ff491cc68d6b499780bfe07bca30d2884ab`
- Explorer: https://chipnet.imaginary.cash/tx/4b5b5e9bacfdc967148248609faa9ff491cc68d6b499780bfe07bca30d2884ab
- 2 debtors, each signing only their own input (sighash `0x61`, ALL|UTXOS|FORKID)
- 5 outputs: receiver `bchtest:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsw62cptj7` (2,500 sats), a second creditor (1,000 sats), 2 change outputs, OP_RETURN memo "Settlemany XO chipnet"
- 460 bytes, 480 sats fee

## Template

- Source: [`src/xo/settlemanyTemplate.ts`](../src/xo/settlemanyTemplate.ts) (action `settleGroup`)
- Template identifier: `56e21b56140e309a9b3276dd42f5054ff984b3c95351c64af36f5f07fc585a99`
- Exported JSON: [`docs/xo/settlemany-template.json`](xo/settlemany-template.json)

## Invitation

- [`docs/xo/invitation.json`](xo/invitation.json) (XO extended JSON)
- 3 commits: the coordinator's root commit (inputs, outputs, memo variable), then one unlock commit per debtor (`mergesWith` the root input)
- Signed `groupSettlementTransaction` created and broadcast results, whose transaction hash equals the txid above
- To inspect it: open https://blaze.xo.cash, import `settlemany-template.json` under Templates, then use Import Invitation with `invitation.json`

## Steps to reproduce

1. `git clone https://github.com/Mzee04/settlemany && cd settlemany && npm install` (Node 24).
2. Copy `scripts/xo-example/keys.secret.example.json` to `keys.secret.json` and fill in a coordinator BIP39 phrase and one chipnet private key (hex) per debtor. This file is git-ignored; never commit it.
3. Fund each debtor's chipnet address (any chipnet faucet).
4. Copy `scripts/xo-example/plan.example.json` to `plan.json` and set the debtors' coins (txid, vout, sats), the creditor addresses, and the transfers.
5. Dry run: `node scripts/xo-chipnet-settle.ts`. It builds the settlement, compiles the XO invitation with the template, has each debtor sign only their own input and add an unlock commit, rebuilds the transaction from the merged invitation, and verifies it in the BCH VM.
6. Broadcast: `node scripts/xo-chipnet-settle.ts --broadcast`. It broadcasts the transaction encoded from the invitation, records the broadcast result, and writes `invitation.json`.
7. Optional: `node scripts/export-template.ts` writes `settlemany-template.json`.

## Fix included

`invitationInputs()` in `src/xo/settleInvitation.ts` used to put an empty `unlockingBytecode` on the root inputs. The XO engine only fills fields that are still unset when it merges commits, so the debtors' unlocks never reached the merged invitation, and the recorded transaction hash was the unsigned one. The root inputs now leave `unlockingBytecode` unset until a signer's commit fills it.
