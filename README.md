# Settlemany

A group expense ledger that closes debts on Bitcoin Cash. Add a trip, a flat, or a team in dollars. Settlemany nets who owes whom, then builds **one transaction** whose inputs come from every debtor and whose outputs pay every creditor exactly. Each person signs only their own inputs. If a wallet cannot do that, they pay their share alone.

Built for the BCH BLAZE 2026 hackathon, Mainnet track. Submissions close Sunday 22 November 2026, 15:00 Africa/Lagos (14:00 UTC).

## Run it

```bash
npm install
npm test
npm run dev
```

The dev server listens on [http://127.0.0.1:4178](http://127.0.0.1:4178). Chipnet is the default network so a mis-click does not spend mainnet coins.

```bash
npm run lint
npm run build
npm run preview
```

The production build is a static site (`dist/`) with relative asset paths, so it can be published on GitHub Pages. A workflow in `.github/workflows/pages.yml` runs the tests and deploys `dist/` when GitHub Pages is enabled for the repository (Settings → Pages → GitHub Actions).

There is no server and no database. The ledger stays in `localStorage`. Signing links and receipt links carry the transaction in the URL.

## Prize address

The banner at the top of every screen shows three slots: the Widget Factory slides, the public repo (`PUBLIC_REPO_URL`, empty until you publish), and the CashTokens prize address.

`PRIZE_ADDRESS` is the token-aware form of the Paytaca address `bitcoincash:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rs2gwlru4z`, derived with libauth (`tokenSupport: true`):

```text
bitcoincash:zp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsdzapd623
```

The banner shows that z address as the CashTokens prize address and the original q address next to it. Both lock the same P2PKH script.

The Google Slides file linked from the hackathon brief exported as the Widget Factory example deck (the project story), not a separate banner specification. The header is a high-contrast ticket: factory hazard stripe, project name, the prize address, and BCH BLAZE 2026.

## What a judge can click

1. **Open the demo group.** “Eko Atlantic weekend” is already filled in: an apartment split equally, dinner by shares, a boat split equally, and suya by percent. The net is three payments to Adaeze, in integer cents.
2. **Simulate the one transaction.** Public demo keys sign a transaction with pretend coins. libauth’s virtual machine checks it. The receipt shows the txid, the amounts, the fee, and an explorer link, and it is marked **not broadcast**. Download CSV and PDF, or copy the receipt link.
3. **Send a real $0.10.** Connect Paytaca or Selene with WizardConnect, on the same network as the toggle. The default recipient is your own wallet, so the coins come back and you only pay the miner fee. Paste another address if you want the ten cents to move. Confirm the toggle before you sign: mainnet spends real BCH, and the page says so.

Demo keys are derived in public from the label `settlemany-public-demo-v1:<name>`. They are not secrets. Do not send funds to those addresses.

## How settlement works

Balances are USD cents. A positive balance is money the group owes that person. `netBalances` finds a minimum set of payments from debtors to creditors. Nobody is asked to front more than they owe. The result is deterministic. Past a search budget the app uses a greedy plan and says so.

A settlement is one version-2 transaction:

- Debtor inputs are ordered by person, then outpoint.
- Creditor outputs pay the exact satoshi amount (BCH) or the exact token amount (PUSD, 2 decimals, so one cent is one base unit).
- Token outputs carry 800 sats of dust. Plain change below 546 sats is left as fee instead of a dust output.
- The miner fee is at least 1 sat/byte and is taken from the debtors, not from the creditors.
- An `OP_RETURN` carries a short memo.
- Every input is signed with **SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_UTXOS** (`0x61`). The signature commits to every input, every output, and every spent coin. Signatures are order-independent. If a coin is spent before broadcast, the old signatures are useless and everyone signs the rebuilt transaction.

PUSD on mainnet is category `2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544`. Chipnet has no canonical PUSD; the chipnet path settles in BCH unless you put a test category in `PUSD_CATEGORY_CHIPNET`. BCH amounts use a live USD price (CoinGecko, then CoinPaprika) or a price you type. Other fiat currencies are snapshotted into USD cents with Frankfurter, or a rate you type.

UTXOs and broadcast go through public Electrum (Fulcrum) servers: `wss://chipnet.bch.ninja:50004` and `wss://chipnet.imaginary.cash:50004` on chipnet, `wss://cashnode.bch.ninja:443` and the imaginary.cash endpoints on mainnet.

## Spike result

The multi-party transaction is consensus-valid in automated tests. libauth generates the keys. Two debtors and two creditors, on chipnet address prefixes (`bchtest:`), for both plain BCH and a fungible CashToken:

- Signing debtor A then B produces the same transaction as B then A.
- The half-signed transaction does not verify. The fully signed transaction does, under the standard BCH virtual machine (`createVirtualMachineBCH(true)`).
- Editing an output after signing makes the virtual machine reject it (`SIGHASH_ALL`).
- A spent input is detected, the transaction is rebuilt without it, the old signatures fail on the new transaction, and fresh signatures pass. Creditor amounts stay exact.
- A weaker sighash byte (`0x41`) is rejected instead of merged.
- A one-person fallback transaction verifies on its own.

These tests do not broadcast. The virtual machine checks the stateless rules chipnet and mainnet share. A live read of chipnet Electrum is also tested: `wss://chipnet.bch.ninja:50004` answers `server.version` (Fulcrum). Broadcasting a real chipnet or mainnet settlement still needs coins in a WizardConnect wallet.

## What Paytaca and Selene need to support

WizardConnect (`@wizardconnect/dapp`) is how the page talks to the wallet. The sign request is built for Paytaca 1ee50a2 (`src/wallet/bch-sign.js` and `src/store/wizardconnect/actions.js`): `broadcast` is always `false` (omitting it makes Paytaca broadcast), `inputPaths` lists only that signer’s inputs as `[index, "receive"|"change", addressIndex]`, and the index is the child of the session xpub whose public key hashes to the coin. The signer’s own source outputs are sent with an empty unlocking script, because Paytaca silently skips a P2PKH input that already has one. Other inputs keep the signatures already collected. Only P2PKH coins are selected. For the one-transaction flow to finish, the wallet has to:

1. Sign with `SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_UTXOS` (`0x61`), which the protocol already requires. Settlemany rejects any other sighash byte.
2. Sign only the inputs named in `inputPaths`, including when other inputs belong to other people and are still unsigned.
3. Leave existing unlocking bytecode on inputs it was not asked to sign, and return the whole transaction. Partial signatures are collected by passing the updated link around.
4. Honor `broadcast: false` and return the signed hex instead of broadcasting. The page broadcasts only when every input is signed.
5. Accept `sourceOutputs` for coins it does not own, including CashToken outputs, because the sighash commits to them.
6. Derive the key from the HD path in `inputPaths` (`receive` or `change`, plus an address index). Settlemany scans the first 40 indexes of those two paths.

Paytaca’s public release notes say it signs P2PKH with `SIGHASH_UTXOS`, honors `broadcast: false`, and signs inputs it owns. They do not promise that it will accept another person’s still-unsigned P2PKH input in the same transaction. Selene has a WizardConnect connection and a sign-request review screen; its behavior on foreign inputs is not published. If either wallet refuses the shared transaction, use **Pay your share**. That builds one transaction per debtor, spending only their coins, still paying each creditor the exact amount. The signing room offers the same fallback when a signature comes back in the wrong shape.

## XO template

[`src/xo/settlemanyTemplate.ts`](src/xo/settlemanyTemplate.ts) is a settlement template in the shape published by `@xo-cash/templates` (the current [XO stack](https://stack.xo.cash/) format). It adds **Settle in Bitcoin Cash** and **Settle in a CashToken**, and the P2PKH unlock asks for `schnorr_signature.all_outputs_all_utxos`, the same `0x61` commitment as the app.

`importWalletTemplate` from libauth rejects this file, and it also rejects the upstream `p2pkhTemplate`, because those templates no longer match libauth’s older wallet-template schema (it asks for `entities` and then rejects additional properties). The test checks that Settlemany’s template has the same top-level shape as the official P2PKH template and that the sighash identifier is present.

## Layout

- `src/domain` — integer cents, splits, netting, the demo group
- `src/chain` — addresses, the settlement builder, signing, Electrum, signing packets
- `src/ui` — the banner, the ledger, the signing room, the $0.10 payment, receipts
- `src/xo` — the XO template

WizardConnect is LGPL-3.0. This application is MIT and links to it; changes to WizardConnect itself would stay under the LGPL.

## Tests

`npm test` covers netting, splits, FX and satoshi conversion, the demo group, BCH and CashToken settlement, partial signatures, sighash rejection, stale-UTXO rebuild, the demo click-through, the XO template shape, and a live chipnet Electrum version check. The Electrum test needs a network path to `chipnet.bch.ninja`.
