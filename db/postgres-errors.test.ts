import { describe, expect, it } from "vitest";

import {
  isUniqueViolation,
  isUniqueViolationOnConstraint,
} from "./postgres-errors";

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

describe("isUniqueViolationOnConstraint", () => {
  it("recognizes a matching constraint name directly on .constraint", () => {
    expect(
      isUniqueViolationOnConstraint(
        { code: "23505", constraint: "levels_curriculum_key_key" },
        "curriculum_key",
      ),
    ).toBe(true);
  });

  it("recognizes a matching constraint name on a wrapped .cause", () => {
    expect(
      isUniqueViolationOnConstraint(
        {
          message: "Failed query",
          cause: {
            code: "23505",
            constraint: "learning_items_curriculum_key_key",
          },
        },
        "curriculum_key",
      ),
    ).toBe(true);
  });

  it("returns false when the SQLSTATE matches but a different constraint fired", () => {
    expect(
      isUniqueViolationOnConstraint(
        { code: "23505", constraint: "levels_language_id_level_number_key" },
        "curriculum_key",
      ),
    ).toBe(false);
  });

  it("returns false for an unrelated SQLSTATE even with a matching constraint substring", () => {
    expect(
      isUniqueViolationOnConstraint(
        { code: "23503", constraint: "levels_curriculum_key_key" },
        "curriculum_key",
      ),
    ).toBe(false);
  });

  it("returns false for non-object values", () => {
    expect(isUniqueViolationOnConstraint(null, "curriculum_key")).toBe(false);
    expect(isUniqueViolationOnConstraint(undefined, "curriculum_key")).toBe(
      false,
    );
  });
});
