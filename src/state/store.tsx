import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NetworkId } from "../chain/address.ts";
import { fetchBchUsdCents } from "../chain/prices.ts";
import { createDemoGroup, DEMO_GROUP_ID } from "../domain/demo.ts";
import type { Group } from "../domain/ledger.ts";

const KEY = "settlemany.v1";

type Saved = {
  network: NetworkId;
  groups: Group[];
  priceCents: number | null;
  demoDismissed: boolean;
};

type Store = Saved & {
  priceMessage: string;
  setNetwork: (network: NetworkId) => void;
  setPriceCents: (cents: number) => void;
  refreshPrice: () => void;
  saveGroup: (group: Group) => void;
  createGroup: (name: string, story: string) => string;
  restoreDemo: () => void;
};

const Ctx = createContext<Store | null>(null);

function seed(): Saved {
  return { network: "chipnet", groups: [createDemoGroup()], priceCents: null, demoDismissed: false };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Saved;
    if (!Array.isArray(parsed.groups)) return seed();
    return {
      network: parsed.network === "mainnet" ? "mainnet" : "chipnet",
      groups: parsed.groups,
      priceCents: typeof parsed.priceCents === "number" ? parsed.priceCents : null,
      demoDismissed: Boolean(parsed.demoDismissed),
    };
  } catch {
    return seed();
  }
}

export function uid(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(load);
  const [priceMessage, setPriceMessage] = useState("Loading the BCH price…");

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [saved]);

  const refreshPrice = () => {
    setPriceMessage("Checking the BCH price…");
    void fetchBchUsdCents()
      .then((cents) => {
        setSaved((current) => ({ ...current, priceCents: cents }));
        setPriceMessage("Live price");
      })
      .catch(() => setPriceMessage("Price feed unavailable. Type a USD price below."));
  };

  useEffect(() => {
    refreshPrice();
  }, []);

  const value = useMemo<Store>(() => {
    return {
      ...saved,
      priceMessage,
      setNetwork: (network) => setSaved((current) => ({ ...current, network })),
      setPriceCents: (priceCents) => setSaved((current) => ({ ...current, priceCents })),
      refreshPrice,
      saveGroup: (group) =>
        setSaved((current) => ({
          ...current,
          groups: current.groups.some((item) => item.id === group.id)
            ? current.groups.map((item) => (item.id === group.id ? group : item))
            : [group, ...current.groups],
        })),
      createGroup: (name, story) => {
        const id = uid("grp");
        const group: Group = {
          id,
          name: name.trim(),
          story: story.trim(),
          createdAt: new Date().toISOString(),
          members: [],
          expenses: [],
          settled: [],
        };
        setSaved((current) => ({ ...current, groups: [group, ...current.groups] }));
        return id;
      },
      restoreDemo: () =>
        setSaved((current) => ({
          ...current,
          demoDismissed: false,
          groups: current.groups.some((group) => group.id === DEMO_GROUP_ID)
            ? current.groups.map((group) => (group.id === DEMO_GROUP_ID ? createDemoGroup() : group))
            : [createDemoGroup(), ...current.groups],
        })),
    };
  }, [saved, priceMessage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("Store missing");
  return store;
}

export function useGroup(id: string | undefined): Group | undefined {
  const { groups } = useStore();
  return groups.find((group) => group.id === id);
}
