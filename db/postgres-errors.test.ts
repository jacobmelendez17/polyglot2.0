import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./postgres-errors";

describe("isUniqueViolation", () => {
  it("recognizes a driver error with the SQLSTATE directly on .code", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognizes a wrapped DrizzleQueryError-shaped error with the SQLSTATE on .cause.code", () => {
    expect(
      isUniqueViolation({ message: "Failed query", cause: { code: "23505" } }),
    ).toBe(true);
  });

  it("returns false for an unrelated Postgres error code", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
  });

  it("returns false for a plain Error with no code", () => {
    expect(isUniqueViolation(new Error("something else went wrong"))).toBe(
      false,
    );
  });

  it("returns false for non-object values", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("error")).toBe(false);
  });
});
