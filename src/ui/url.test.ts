import { describe, expect, it } from "vitest";
import { joinAppUrl } from "./url.ts";

describe("GitHub Pages URLs", () => {
  it("keeps hash routes and WizardConnect return links under /settlemany/", () => {
    expect(joinAppUrl("https://mzee04.github.io", "/settlemany/", "#/pay")).toBe(
      "https://mzee04.github.io/settlemany/#/pay",
    );
    expect(joinAppUrl("https://mzee04.github.io", "/settlemany", "#/sign/abc")).toBe(
      "https://mzee04.github.io/settlemany/#/sign/abc",
    );
    expect(joinAppUrl("http://127.0.0.1:4178", "/", "group/demo")).toBe(
      "http://127.0.0.1:4178/#group/demo",
    );
  });
});
