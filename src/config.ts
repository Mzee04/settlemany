/**
 * Paytaca wallet address supplied for the EMBER2026 prize.
 * This is the ordinary P2PKH form (q prefix, no token-type bit).
 */
export const PAYTACA_ADDRESS = "bitcoincash:qp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rs2gwlru4z";

/**
 * EMBER2026 prize CashTokens address.
 *
 * Same locking script as PAYTACA_ADDRESS, encoded by libauth with
 * tokenSupport so wallets know it can receive CashTokens (z prefix).
 * Derived: bitcoincash:zp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsdzapd623
 */
export const PRIZE_ADDRESS = "bitcoincash:zp9pl4khtqm4x2xzsp6e0qc6tsrq0p08rsdzapd623";

export const PRIZE_ADDRESS_IS_PLACEHOLDER = false;

/** Widget Factory slide deck from the BCH BLAZE brief. */
export const WIDGET_FACTORY_SLIDES_URL =
  "https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing";

/**
 * Public repository URL. Leave empty until the project is published.
 * The banner always shows the slot.
 */
export const PUBLIC_REPO_URL = "";

/** ParyonUSD fungible category on Bitcoin Cash mainnet. 2 decimal places. */
export const PUSD_CATEGORY_MAINNET =
  "2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544";

/**
 * Chipnet has no canonical ParyonUSD deployment. Leave this empty unless you
 * are pointing the chipnet toggle at a test category you created yourself.
 */
export const PUSD_CATEGORY_CHIPNET = "";

export const APP_NAME = "Settlemany";
