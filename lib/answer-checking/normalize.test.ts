import { describe, expect, it } from "vitest";

import { normalizeForComparison } from "./normalize";

describe("normalizeForComparison", () => {
  it("collapses case and surrounding whitespace", () => {
    expect(normalizeForComparison("  Gato  ")).toBe("gato");
  });

  it("collapses internal whitespace runs", () => {
    expect(normalizeForComparison("el   gato")).toBe("el gato");
  });

  it("never erases diacritics", () => {
    expect(normalizeForComparison("sí")).toBe("sí");
    expect(normalizeForComparison("si")).toBe("si");
    expect(normalizeForComparison("sí")).not.toBe(normalizeForComparison("si"));
  });

  it("is deterministic", () => {
    expect(normalizeForComparison("El Gato")).toBe(normalizeForComparison("el gato"));
  });
});
