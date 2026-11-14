# Settlemany — two-minute demo script

Read this while the screen recording runs. About two minutes. Stay on chipnet unless you say you are switching.

Open https://mzee04.github.io/settlemany/ before you hit record. Chipnet is already selected.

---

**0:00 — Problem**

“A group trip ends the same way every time. One person paid the apartment, someone else paid dinner, and then you spend the ride home doing math and sending five separate payments. Settlemany is the ledger that closes those debts on Bitcoin Cash, in one transaction.”

**0:20 — Home and banner**

“This bar is the hackathon banner. The CashTokens prize address is the z address. Next to it is the same Paytaca wallet in the normal q form. Slides and the public repo are here. Chipnet is on, so nothing on this page spends mainnet coins.”

**0:35 — Demo group**

“Open the demo. Eko Atlantic weekend is already filled in. Adaeze is owed the rest. The fewest payments are three: Chinedu, Bisi, and Emeka each pay her. Equal split, shares, and percents are already in the list. I did not type any of this.”

**0:55 — Two wallets, one transaction**

“The live proof is two Paytaca wallets on chipnet. I am one debtor. A friend is the other. We each open the signing link, connect WizardConnect, and sign only our own input. SIGHASH_ALL commits both of us to the whole transaction, including the other person’s coins. When both signatures are in, one broadcast pays the receiver.”

Point at the explorer, or at a receipt you already have:

“That broadcast is this transaction. The receiver got exactly 9,060 satoshis, which was the two-cent demo. The fee was 437 sats. One txid. Two wallets. No second payment to finish the split.”

Explorer, if you show it: https://explorer.selene.cash/tx/10976994b4ffab36a9f6eb8d25459ca3451e5d65302e867e1076dbd46a0f5927?network=chipnet

**1:30 — Receipt**

“The receipt keeps the txid, the amounts, and the explorer link. CSV and PDF are a table: who paid, which address, how many dollars, how many sats, the fee once, and the txid. You can copy the receipt URL.”

**1:50 — Close**

“Mainnet is the other side of that toggle, for a real payment later. Chipnet was the test. The group is settled in one Bitcoin Cash transaction.”
