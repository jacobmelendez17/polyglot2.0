import { describe, expect, it } from "vitest";

import {
  curriculumImportObjectKey,
  parseCurriculumImportObjectKey,
} from "./curriculum-import-object-key";

describe("curriculumImportObjectKey", () => {
  it("builds the spec 19 §6 key shape for a csv upload", () => {
    expect(
      curriculumImportObjectKey("11111111-1111-1111-1111-111111111111", "csv"),
    ).toBe("imports/11111111-1111-1111-1111-111111111111/source.csv");
  });

  it("builds the same shape for a tsv upload", () => {
    expect(
      curriculumImportObjectKey("11111111-1111-1111-1111-111111111111", "tsv"),
    ).toBe("imports/11111111-1111-1111-1111-111111111111/source.tsv");
  });

  it("never depends on anything but the import id and extension", () => {
    const a = curriculumImportObjectKey("aaaa", "csv");
    const b = curriculumImportObjectKey("aaaa", "csv");
    expect(a).toBe(b);
  });
});

describe("parseCurriculumImportObjectKey", () => {
  it("recovers the import id and extension curriculumImportObjectKey encoded", () => {
    const importId = "11111111-1111-1111-1111-111111111111";
    expect(
      parseCurriculumImportObjectKey(
        curriculumImportObjectKey(importId, "csv"),
      ),
    ).toEqual({ importId, fileExtension: "csv" });
    expect(
      parseCurriculumImportObjectKey(
        curriculumImportObjectKey(importId, "tsv"),
      ),
    ).toEqual({ importId, fileExtension: "tsv" });
  });

  it("returns null for anything that isn't this exact shape", () => {
    expect(
      parseCurriculumImportObjectKey("imports/not-a-uuid/source.csv"),
    ).toBeNull();
    expect(
      parseCurriculumImportObjectKey(
        "imports/11111111-1111-1111-1111-111111111111/source.txt",
      ),
    ).toBeNull();
    expect(
      parseCurriculumImportObjectKey("something-else-entirely"),
    ).toBeNull();
  });
});
