import { describe, expect, it } from "vitest";

import { splitDisplayNameForClerk } from "./clerk-name-sync";

describe("splitDisplayNameForClerk", () => {
  it("splits a two-word name into firstName/lastName", () => {
    expect(splitDisplayNameForClerk("Jacob Melendez")).toEqual({ firstName: "Jacob", lastName: "Melendez" });
  });

  it("keeps a multi-word last name joined", () => {
    expect(splitDisplayNameForClerk("Maria De La Cruz")).toEqual({ firstName: "Maria", lastName: "De La Cruz" });
  });

  it("a single-word name has no last name — an empty string, not omitted, so a previous Clerk last name is cleared", () => {
    expect(splitDisplayNameForClerk("Jacob")).toEqual({ firstName: "Jacob", lastName: "" });
  });

  it("collapses repeated internal whitespace", () => {
    expect(splitDisplayNameForClerk("Jacob    Melendez")).toEqual({ firstName: "Jacob", lastName: "Melendez" });
  });

  it("trims leading/trailing whitespace", () => {
    expect(splitDisplayNameForClerk("  Jacob Melendez  ")).toEqual({ firstName: "Jacob", lastName: "Melendez" });
  });
});
