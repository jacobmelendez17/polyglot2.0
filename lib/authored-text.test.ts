import { describe, expect, it } from "vitest";

import { stripEmphasisMarks } from "./authored-text";

describe("stripEmphasisMarks", () => {
  it("removes the ticks and keeps the words, so audio never says 'quote'", () => {
    expect(stripEmphasisMarks("Yo 'también' quiero ir.")).toBe(
      "Yo también quiero ir.",
    );
  });

  it("leaves apostrophes inside words alone", () => {
    expect(stripEmphasisMarks("It's what they don't say")).toBe(
      "It's what they don't say",
    );
  });
});
