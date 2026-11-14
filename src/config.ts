/**
 * EMBER2026 prize CashTokens address.
 *
 * Replace PRIZE_ADDRESS with your Paytaca CashTokens address before you
 * submit. It must be a mainnet cashaddr (bitcoincash:...) that can receive
 * CashTokens. The banner reads this constant and nothing else.
 */
export const PRIZE_ADDRESS = "PASTE_YOUR_PAYTACA_CASHTOKENS_ADDRESS";

export const PRIZE_ADDRESS_IS_PLACEHOLDER =
  PRIZE_ADDRESS === "PASTE_YOUR_PAYTACA_CASHTOKENS_ADDRESS";

/** ParyonUSD fungible category on Bitcoin Cash mainnet. 2 decimal places. */
export const PUSD_CATEGORY_MAINNET =
  "2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544";

/**
 * Chipnet has no canonical ParyonUSD deployment. Leave this empty unless you
 * are pointing the chipnet toggle at a test category you created yourself.
 */
export const PUSD_CATEGORY_CHIPNET = "";

export const APP_NAME = "Settlemany";
