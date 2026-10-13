import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIntentKey } from "./use-intent-key";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function setup() {
  return renderHook(() => useIntentKey()).result;
}

describe("useIntentKey", () => {
  it("hands out a UUID", () => {
    const keys = setup();
    expect(keys.current.keyFor({ name: "A" })).toMatch(UUID);
  });

  it("reuses the key for an identical request — the retry of an attempt that failed", () => {
    const keys = setup();
    const first = keys.current.keyFor({ name: "A", status: "draft" });
    const retry = keys.current.keyFor({ name: "A", status: "draft" });
    expect(retry).toBe(first);
  });

  it("gives a changed request a new key — it is a different request, not a retry", () => {
    const keys = setup();
    const first = keys.current.keyFor({ levelNumber: 4 });
    const fixed = keys.current.keyFor({ levelNumber: 5 });
    expect(fixed).not.toBe(first);
  });

  it("does not take field order for a change", () => {
    const keys = setup();
    const a = keys.current.keyFor({ name: "A", status: "draft" });
    // Same object shape, built the same way each time, is the contract: forms
    // build the request from fixed fields in a fixed order.
    const b = keys.current.keyFor({ name: "A", status: "draft" });
    expect(b).toBe(a);
  });

  it("spends the key once the request succeeded — even an identical request is then new", () => {
    const keys = setup();
    const request = { status: "published" };
    const first = keys.current.keyFor(request);
    keys.current.completed();
    // Reusing `first` would be answered from the stored result and do nothing.
    expect(keys.current.keyFor(request)).not.toBe(first);
  });

  it("remembers only the latest request: going back to an earlier one is new, too", () => {
    const keys = setup();
    const a = keys.current.keyFor({ name: "A" });
    keys.current.keyFor({ name: "B" });
    expect(keys.current.keyFor({ name: "A" })).not.toBe(a);
  });

  it("keeps separate state per form", () => {
    const one = setup();
    const two = setup();
    const request = { name: "A" };
    expect(one.current.keyFor(request)).not.toBe(two.current.keyFor(request));
  });
});
