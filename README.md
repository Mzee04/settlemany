# Settlemany

A group expense ledger that closes debts on Bitcoin Cash. Add a trip, a flat, or a team in dollars. Settlemany nets who owes whom, then builds **one transaction** whose inputs come from every debtor and whose outputs pay every creditor exactly. Each person signs only their own inputs. If a wallet cannot do that, they pay their share alone.

Built for the BCH BLAZE 2026 hackathon, Mainnet track. Submissions close Sunday 22 November 2026, 15:00 Africa/Lagos (14:00 UTC).

## BLAZE timeline

Kickoff was 14 November 2026, 14:00 UTC. The last commit before that is `d9b522e` (`d9b522ea2a0ccae2d55b6ead8571e50ad1dc9dd5`), tagged `blaze-kickoff-before`. That tag is the pre-kickoff code. Everything after it, including the XO settlement path, is BLAZE work.

## Run it

```bash
npm install
npm test
npm run dev
```

The dev server listens on [http://127.0.0.1:4178](http://127.0.0.1:4178). Mainnet is the default network so a judge can send a small real Bitcoin Cash payment. Chipnet stays available as Chipnet test in the top bar, or by opening the page with `?network=chipnet`. Mainnet coins are read and broadcast through Fulcrum at `wss://cashnode.bch.ninja:443`, `wss://electrum.imaginary.cash:50004`, and `wss://bch.imaginary.cash:50004`. Mainnet transactions and addresses open on the Bitcoin Unlimited explorer (`https://explorer.bitcoinunlimited.info`). Chipnet uses Fulcrum at `wss://chipnet.bch.ninja:50004` and `wss://chipnet.imaginary.cash:50004`. A mainnet page refuses a `bchtest:` address, and a chipnet page refuses a `bitcoincash:` address. WizardConnect follows the toggle: the connected wallet’s receive key is shown as a `bitcoincash:` address on mainnet and a `bchtest:` address on chipnet. PUSD is mainnet-only, category `2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544`, the canonical mainnet-v1 id published at [paryonusd.com contract verification](https://paryonusd.com/docs/technical/contract-verification).

```bash
npm run lint
npm run build
npm run preview
```

The public repo is [github.com/Mzee04/settlemany](https://github.com/Mzee04/settlemany). The production build is a static site (`dist/`) whose asset and route URLs use the `/settlemany/` base, so it loads at [mzee04.github.io/settlemany](https://mzee04.github.io/settlemany/). `.github/workflows/pages.yml` runs the tests and deploys `dist/` with `actions/upload-pages-artifact` and `actions/deploy-pages`. In the repository, set Settings → Pages → Build and deployment → Source to **GitHub Actions** (`build_type: workflow`). Hash routes (`#/pay`, `#/sign/…`) stay on that path, including links you copy for WizardConnect co-signing.

There is no server and no database. The ledger stays in `localStorage`. Signing links and receipt links carry the transaction in the URL.

## Prize address

The banner at the top of every screen is a slim BCH BLAZE 2026 entry: Slides, Code, Vote with EMBER2026 and the CashTokens address, a copy button, and a line that it was built from 14 Nov 2026.

`PRIZE_ADDRESS` is the token-aware form of the Paytaca address `bitcoincash:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rs2gwlru4z`, derived with libauth (`tokenSupport: true`):

```text
bitcoincash:zp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsdzapd623
```

The banner shows that z address beside Vote with EMBER2026. The q address locks the same P2PKH script.

The Google Slides file linked from the hackathon brief exported as the Widget Factory example deck (the project story), not a separate banner specification. The header is a slim high-contrast ticket: factory hazard stripe, Slides, Code, the prize address, and built from 14 Nov 2026.

## Live proof

Two Paytaca wallets on chipnet each signed only their own input, and one transaction paid the receiver exactly.

- Group settle: [10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927](https://explorer.selene.cash/tx/10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927?network=chipnet)
- Payers: `bchtest:zpjfemuqvwy4kfay7p6j6kkqls4rxxkv7uvdw9ghdg` (me) and `bchtest:zzh0srv55mem9nd8508llyuchm6e5vea9ylmynsfxy` (friend)
- Receiver: `bchtest:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsw62cptj7` got **9,060 sats** ($0.02). Miner fee **437 sats**.

That transaction is the one-transaction claim on a public chain. Two real Paytaca iOS wallets, connected with WizardConnect, each signed only the input they owned. The sighash was `SIGHASH_ALL | SIGHASH_FORKID | SIGHASH_UTXOS`, so each signature commits to every input and every output. The receiver was paid that exact amount. Nobody broadcast a second transaction to finish the split.

An earlier single-wallet send of $0.02 on the same network is [8068648f657eff370e8d1c3c8da21b046f11c3a7be95426461f8b75438c00e47](https://explorer.selene.cash/tx/8068648f657eff370e8d1c3c8da21b046f11c3a7be95426461f8b75438c00e47?network=chipnet). A mainnet send is [0c8a34f625da5073e8301f6c991dcb783d10ced6bc315e97242636d9cbe6c062](https://explorer.bitcoinunlimited.info/tx/0c8a34f625da5073e8301f6c991dcb783d10ced6bc315e97242636d9cbe6c062). Miner fee **264 sats**. The chipnet group settle above stays [10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927](https://explorer.selene.cash/tx/10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927?network=chipnet).

## What a judge can click

1. **Send $0.02 on mainnet.** Connect Paytaca on mainnet. The form shows the balance of the connected address and a button to copy that address. A `bchtest:` address is rejected, and the send button stays off. After the wallet signs, the receipt says so and the full transaction id is the explorer link.
2. **Open the demo group.** “Eko Atlantic weekend” is chipnet. It is already filled in: an apartment split equally, dinner by shares, a boat split equally, and suya by percent. The net is three payments to Adaeze, in integer cents. Those addresses start with `bchtest:`.
3. **Simulate the one transaction.** Public demo keys sign a transaction with pretend coins. libauth’s virtual machine checks it. The receipt shows the txid, the amounts, the fee, and an explorer link, and it is marked **not broadcast**. Download CSV and PDF, or copy the receipt link.

## Privacy

There are no accounts. The ledger stays in this browser. Settlemany never asks for a seed phrase. WizardConnect returns a signature, not a key. When the page looks up coins or broadcasts, Fulcrum sees the address you asked about. A signing link contains the transaction. Pages links use `https://mzee04.github.io/settlemany/#/…`.

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

## Built with XO

The group settlement now has an XO path on `@xo-cash/engine` `0.1.1-next.18029697917` (the `next` release on npm when this was written) and `@xo-cash/templates` `0.0.12`. Docs: [stack.xo.cash](https://stack.xo.cash/getting-started.html). Debug tool: [blaze.xo.cash](https://blaze.xo.cash/). Source: [gitlab.com/GeneralProtocols/xo](https://gitlab.com/GeneralProtocols/xo).

What moved onto XO:

- [`src/xo/settlemanyTemplate.ts`](src/xo/settlemanyTemplate.ts) is the contract. Action `settleGroup` is one version-2 transaction. Debtor slots are unlimited. Each debtor input asks for `schnorr_signature.all_outputs_all_utxos` (byte `0x61`). Creditor outputs pay an exact amount. `spendReceivedShare` is the creditor follow-up on the payee locking script.
- The settle screen’s **XO** toggle (the default) asks the engine to `importTemplate`, `createInvitation`, `joinInvitationRole` as the debtor, and `buildInvitationTransactionFromMergedCommit`. The encoded bytes are the transaction Paytaca signs. WizardConnect is unchanged.
- When every input is signed, the browser that created the invitation writes those unlocking scripts back with `appendInvitation` and broadcasts with `executeAction({ broadcastTransaction: true })`.
- **Classic** is the pre-XO builder. If XO throws, the app uses Classic and says why.

What stays off XO, and the alpha limits that forced it:

- Coin selection. `listSpendableUnspentOutputs` only returns coins the engine account tracks. Debtors’ Paytaca coins are selected by the existing builder, then committed as inputs.
- Signing. `signInvitation` throws `InputUnspentOutputUnavailableError` unless the spent output is tracked by the engine mnemonic. Settlemany never asks for a seed. Paytaca signs through WizardConnect. The clerk engine holds the debtor role because a Paytaca wallet cannot `acceptInvitation`.
- Change. `addChangeToInvitation` returns every leftover satoshi to one locking script. A group settlement still adds one change output per debtor. An empty `unlockingBytecode` on the first commit cannot be filled later (`fillEmptyFields` only replaces `undefined`), so the first commit omits it.
- One Electrum client per tab. A second `Engine.create` throws `Cannot configure storage for cache after it has been initialized.` Reload the page after switching mainnet and chipnet before building with XO again.
- Storage. `@xo-cash/state` `0.0.5` marks SQLite as not implemented. The app uses IndexedDB. The browser bundle stubs `better-sqlite3`, `fs`, and `path` because those Node imports are still at the top of the package.
- The follow-up `spendReceivedShare` is on the template. Paytaca addresses are external locking scripts, so this app does not compile that follow-up or track the creditor output. The debug tool can still read the action.
- The types package allows `relevant` on a locking script. The utils build pinned by this engine (`0.0.10`) rejects it. The template leaves it off.
- A coordinator mnemonic is generated in the browser and kept in `localStorage` under `settlemany.xoCoordinator.v1`. It only signs invitation commits. It is not a funding seed, it is not shown as a receive address, and it is not in the repository. Do not import it into Paytaca.

### Run the XO path

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:4178](http://127.0.0.1:4178). Mainnet is already selected. Chipnet is the top-bar toggle, or `?network=chipnet`. On the group’s settle screen, **XO** is the builder. **Classic** skips the engine.

### Mainnet settle for a judge, with Paytaca

Use a tiny amount. The published site updates only after this branch is merged to `main`. Until then, run the branch locally with the commands above. The production URL after merge is [https://mzee04.github.io/settlemany/](https://mzee04.github.io/settlemany/).

1. Open the app on mainnet. Connect Paytaca with **Connect wallet** and scan the WizardConnect QR in Paytaca. The wallet must be on mainnet. The page shows a `bitcoincash:` address.
2. Make a group of two or three people. Each debtor and the creditor paste a mainnet CashTokens address (the connected wallet’s address can be copied from the pay screen). Add an expense of a few cents.
3. Open **Settle**. Leave the builder on **XO**. Wait for the BCH price or type one. Click **Build a real signing link**.
4. Copy **Copy XO invitation**. Paste it into [blaze.xo.cash](https://blaze.xo.cash/). The template id is on the settle screen. The template source is `src/xo/settlemanyTemplate.ts`.
5. Each debtor opens the signing link on a phone that can reach their Paytaca, connects that wallet, and taps **Sign my inputs**. Paytaca must be on mainnet, `broadcast` stays off, and each wallet signs only its own inputs. Pass the updated link to the next debtor.
6. From the browser that built the link (it still holds the invitation), tap **Broadcast**. That browser calls the XO engine. If you broadcast from a different browser, Settlemany says so and broadcasts through its own Electrum client instead.
7. The receipt links the txid on [explorer.bitcoinunlimited.info](https://explorer.bitcoinunlimited.info). The historical proofs below are unchanged.

Chipnet is the same steps with **Chipnet test** selected before the first XO build in that tab, `bchtest:` addresses, and coins from [tbch.googol.cash](https://tbch.googol.cash/) or [chipnet.bch.ninja](https://chipnet.bch.ninja/). The original project, before this migration, is the `blaze-kickoff-before` tag.

## Layout

- `src/domain` — integer cents, splits, netting, the demo group
- `src/chain` — addresses, the settlement builder, signing, Electrum, signing packets
- `src/ui` — the banner, the ledger, the signing room, the small mainnet payment, receipts
- `src/xo` — the XO template, the engine session, and the browser shims for Node-only imports

WizardConnect is LGPL-3.0. This application is MIT and links to it; changes to WizardConnect itself would stay under the LGPL.

## Tests

`npm test` covers netting, splits, FX and satoshi conversion, the demo group, BCH and CashToken settlement, partial signatures, sighash rejection, stale-UTXO rebuild, the demo click-through, the XO template, an XO engine build of the same transaction (including a CashToken settlement and signatures written back onto the invitation), and a live chipnet Electrum version check. The Electrum and XO engine tests need a network path to chipnet.
