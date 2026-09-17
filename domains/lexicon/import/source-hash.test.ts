import { describe, expect, it } from "vitest";

import { hashBytes, hashSourceValue } from "./source-hash";

describe("hashSourceValue", () => {
  it("is stable regardless of object key order", () => {
    expect(hashSourceValue({ a: 1, b: 2 })).toBe(
      hashSourceValue({ b: 2, a: 1 }),
    );
  });

  it("is stable through nesting", () => {
    expect(hashSourceValue({ outer: { a: 1, b: [{ x: 1, y: 2 }] } })).toBe(
      hashSourceValue({ outer: { b: [{ y: 2, x: 1 }], a: 1 } }),
    );
  });

  it("treats array order as meaningful — sense order is real content", () => {
    expect(hashSourceValue([1, 2])).not.toBe(hashSourceValue([2, 1]));
  });

  it("changes when any value changes", () => {
    expect(hashSourceValue({ gloss: "father" })).not.toBe(
      hashSourceValue({ gloss: "dad" }),
    );
  });

  it("distinguishes an accented value from its unaccented counterpart", () => {
    expect(hashSourceValue({ word: "si" })).not.toBe(
      hashSourceValue({ word: "sí" }),
    );
  });

  it("ignores explicitly undefined fields, which JSON cannot represent anyway", () => {
    expect(hashSourceValue({ a: 1, b: undefined })).toBe(
      hashSourceValue({ a: 1 }),
    );
  });
});

describe("hashBytes", () => {
  it("produces a stable hex digest", () => {
    expect(hashBytes("padre")).toBe(hashBytes(Buffer.from("padre", "utf8")));
    expect(hashBytes("padre")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBytes("padre")).not.toBe(hashBytes("madre"));
  });
});
