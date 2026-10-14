import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mapAdminApiError } from "./admin-api-errors";
import { parseResponse } from "./response-contract";

const schema = z.object({ id: z.string(), role: z.enum(["user", "admin"]) });

describe("parseResponse", () => {
  it("returns what the contract describes, and nothing it does not", () => {
    expect(
      parseResponse(schema, { id: "1", role: "user", email: "a@example.com" }),
    ).toEqual({ id: "1", role: "user" });
  });

  it("throws a plain error — not a ZodError, which the admin pipeline would answer as the caller's 422", () => {
    let thrown: unknown;
    try {
      parseResponse(schema, { id: "1", role: "superuser" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(z.ZodError);
    // So the pipeline lets it through to be logged and answered as a generic 500.
    expect(mapAdminApiError(thrown)).toBeNull();
  });

  it("names the fields that disagree, never their values", () => {
    expect(() =>
      parseResponse(schema, { id: 5, role: "someone@example.com" }),
    ).toThrow(/id \(invalid_type\), role \(invalid_value\)/);
    expect(() =>
      parseResponse(schema, { id: 5, role: "someone@example.com" }),
    ).not.toThrow(/someone@example\.com/);
  });

  it("names the root when the whole answer is the wrong shape", () => {
    expect(() => parseResponse(schema, null)).toThrow(/\(root\)/);
  });
});
