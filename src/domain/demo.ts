import { demoIdentity } from "../chain/address.ts";
import type { Group } from "./ledger.ts";

export const DEMO_GROUP_ID = "demo-eko-atlantic";

const WHEN = "2026-11-08T18:00:00.000Z";

function member(id: string, name: string) {
  return {
    id,
    name,
    address: demoIdentity(id, "chipnet").address,
    demoKeyLabel: id,
  };
}

/** A filled-in weekend so a judge can click through without typing. */
export function createDemoGroup(): Group {
  return {
    id: DEMO_GROUP_ID,
    name: "Eko Atlantic weekend",
    story: "Four friends, one apartment, and a boat. The ledger is already written. Settle it in a single transaction.",
    createdAt: WHEN,
    members: [
      member("ada", "Adaeze Okonkwo"),
      member("chinedu", "Chinedu Bello"),
      member("bisi", "Bisi Adeyemi"),
      member("emeka", "Emeka Nwosu"),
    ],
    expenses: [
      {
        id: "apt",
        memo: "Apartment, two nights",
        payerId: "ada",
        amountCents: 18600,
        currency: "USD",
        usdCents: 18600,
        fxNote: "Entered in USD",
        splitMode: "equal",
        parts: ["ada", "chinedu", "bisi", "emeka"].map((memberId) => ({ memberId })),
        createdAt: WHEN,
      },
      {
        id: "dinner",
        memo: "Dinner at the grill",
        payerId: "chinedu",
        amountCents: 7450,
        currency: "USD",
        usdCents: 7450,
        fxNote: "Entered in USD",
        splitMode: "shares",
        parts: [
          { memberId: "ada", shares: 2 },
          { memberId: "chinedu", shares: 2 },
          { memberId: "bisi", shares: 1 },
          { memberId: "emeka", shares: 0 },
        ],
        createdAt: WHEN,
      },
      {
        id: "boat",
        memo: "Boat for the afternoon",
        payerId: "bisi",
        amountCents: 3600,
        currency: "USD",
        usdCents: 3600,
        fxNote: "Entered in USD",
        splitMode: "equal",
        parts: ["ada", "chinedu", "bisi", "emeka"].map((memberId) => ({ memberId })),
        createdAt: WHEN,
      },
      {
        id: "suya",
        memo: "Suya and drinks",
        payerId: "emeka",
        amountCents: 2240,
        currency: "USD",
        usdCents: 2240,
        fxNote: "Entered in USD",
        splitMode: "percent",
        parts: [
          { memberId: "ada", percentBps: 4000 },
          { memberId: "chinedu", percentBps: 2000 },
          { memberId: "bisi", percentBps: 2000 },
          { memberId: "emeka", percentBps: 2000 },
        ],
        createdAt: WHEN,
      },
    ],
    settled: [],
  };
}
