export type SettlementBuilder = "xo" | "classic";

const KEY = "settlemany.builder";

export function settlementBuilder(): SettlementBuilder {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "xo";
  } catch {
    return "xo";
  }
}

export function setSettlementBuilder(builder: SettlementBuilder): void {
  try {
    localStorage.setItem(KEY, builder);
  } catch {
    // The toggle still works for this page view when storage is blocked.
  }
}
