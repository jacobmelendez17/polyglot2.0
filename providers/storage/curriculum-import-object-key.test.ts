import { describe, expect, it } from "vitest";

import { curriculumImportObjectKey } from "./curriculum-import-object-key";

describe("curriculumImportObjectKey", () => {
  it("builds the spec 19 §6 key shape for a csv upload", () => {
    expect(curriculumImportObjectKey("11111111-1111-1111-1111-111111111111", "csv")).toBe(
      "imports/11111111-1111-1111-1111-111111111111/source.csv",
    );
  });

  it("builds the same shape for a tsv upload", () => {
    expect(curriculumImportObjectKey("11111111-1111-1111-1111-111111111111", "tsv")).toBe(
      "imports/11111111-1111-1111-1111-111111111111/source.tsv",
    );
  });

  it("never depends on anything but the import id and extension", () => {
    const a = curriculumImportObjectKey("aaaa", "csv");
    const b = curriculumImportObjectKey("aaaa", "csv");
    expect(a).toBe(b);
  });
});
