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
  "https://docs.google.com/presentation/d/1St92HFWiFD4wyBWYELFyULkRgar4tIxR5mDxNvnGAys/edit?usp=sharing";

/** Public repository. The banner links here. */
export const PUBLIC_REPO_URL = "https://github.com/Mzee04/settlemany";

/** Last commit before the BCH BLAZE kickoff (14 Nov 2026 14:00 UTC), tag `blaze-kickoff-before`. */
export const CODE_BEFORE_URL = "https://github.com/Mzee04/settlemany/tree/blaze-kickoff-before";

/** Code after kickoff. This is the repository BLAZE work lands on. */
export const CODE_AFTER_URL = "https://github.com/Mzee04/settlemany";

/** GitHub Pages site. Hash routes hang off this path. */
export const PAGES_URL = "https://mzee04.github.io/settlemany/";

/** Pre-kickoff demo. */
export const DEMO_BEFORE_URL = "https://settlemany-before.onrender.com";

/** Demo after kickoff. Mainnet is the default on this site. */
export const DEMO_AFTER_URL = "https://mzee04.github.io/settlemany/";

/** XO debug tool named in the BLAZE Migrate to XO bounty. */
export const XO_DEBUG_TOOL_URL = "https://blaze.xo.cash/";

/**
 * ParyonUSD fungible category on Bitcoin Cash mainnet. 2 decimal places.
 * This is the canonical mainnet-v1 id from
 * https://paryonusd.com/docs/technical/contract-verification.
 */
export const PUSD_CATEGORY_MAINNET =
  "2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544";

/**
 * Chipnet has no canonical ParyonUSD deployment. Leave this empty unless you
 * are pointing the chipnet toggle at a test category you created yourself.
 */
export const PUSD_CATEGORY_CHIPNET = "";

export const APP_NAME = "Settlemany";
