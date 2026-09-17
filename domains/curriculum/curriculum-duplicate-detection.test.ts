import { describe, expect, it } from "vitest";

import { findDuplicateCandidates } from "./curriculum-duplicate-detection";

describe("findDuplicateCandidates", () => {
  it("matches case and whitespace variants of the same term", () => {
    const candidates = [
      {
        learningItemId: "item-1",
        displayForm: "gato",
        displayLabel: "el gato",
        status: "published" as const,
      },
    ];
    expect(findDuplicateCandidates("GATO", candidates)).toHaveLength(1);
    expect(findDuplicateCandidates(" Gato ", candidates)).toHaveLength(1);
  });

  it("never conflates 'si' and 'sí' — accents remain meaningful", () => {
    const candidates = [
      {
        learningItemId: "item-1",
        displayForm: "sí",
        displayLabel: "sí",
        status: "published" as const,
      },
    ];
    expect(findDuplicateCandidates("si", candidates)).toHaveLength(0);
    expect(findDuplicateCandidates("sí", candidates)).toHaveLength(1);
  });

  it("returns no candidates when nothing matches", () => {
    const candidates = [
      {
        learningItemId: "item-1",
        displayForm: "gato",
        displayLabel: "el gato",
        status: "published" as const,
      },
    ];
    expect(findDuplicateCandidates("perro", candidates)).toHaveLength(0);
  });

  it("returns every matching candidate, not just the first", () => {
    const candidates = [
      {
        learningItemId: "item-1",
        displayForm: "banco",
        displayLabel: "el banco (bank)",
        status: "published" as const,
      },
      {
        learningItemId: "item-2",
        displayForm: "banco",
        displayLabel: "el banco (bench)",
        status: "pending" as const,
      },
    ];
    expect(findDuplicateCandidates("banco", candidates)).toHaveLength(2);
  });
});
