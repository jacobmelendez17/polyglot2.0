import { describe, expect, it } from "vitest";

import { detectMaterialChange, rowMateriallyChanged } from "./material-change";
import type {
  CurriculumImportRowPreviewInput,
  CurriculumImportRowRecord,
} from "@/domains/admin/curriculum-import-types";

function storedRow(
  overrides: Partial<CurriculumImportRowRecord> = {},
): CurriculumImportRowRecord {
  return {
    id: "row-1",
    importId: "import-1",
    rowNumber: 1,
    itemType: "vocabulary",
    displayTerm: "comer",
    levelNumber: 1,
    groupNumber: 1,
    classification: "create",
    previousClassification: null,
    resolvedLearningItemId: null,
    changedFields: null,
    reviewReasonCode: null,
    reviewReason: null,
    adminDisposition: null,
    changedSincePreview: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function freshRow(
  overrides: Partial<CurriculumImportRowPreviewInput> = {},
): CurriculumImportRowPreviewInput {
  return {
    rowNumber: 1,
    itemType: "vocabulary",
    displayTerm: "comer",
    levelNumber: 1,
    groupNumber: 1,
    classification: "create",
    resolvedLearningItemId: null,
    changedFields: null,
    reviewReasonCode: null,
    reviewReason: null,
    ...overrides,
  };
}

describe("rowMateriallyChanged", () => {
  it("is false when nothing spec 19 §13 cares about differs", () => {
    expect(rowMateriallyChanged(storedRow(), freshRow())).toBe(false);
  });

  it("a mere timestamp/unrelated field never counts (spec 19 §13's explicit carve-out) — displayTerm/reviewReason aren't compared", () => {
    const stored = storedRow({
      displayTerm: "comer",
      reviewReason: "old reason",
    });
    const fresh = freshRow({
      displayTerm: "comer (renamed)",
      reviewReason: "new reason",
    });
    expect(rowMateriallyChanged(stored, fresh)).toBe(false);
  });

  it("a classification change is material", () => {
    expect(
      rowMateriallyChanged(
        storedRow({ classification: "create" }),
        freshRow({ classification: "update" }),
      ),
    ).toBe(true);
  });

  it("a different matched curriculum item is material", () => {
    expect(
      rowMateriallyChanged(
        storedRow({ resolvedLearningItemId: "item-a" }),
        freshRow({ resolvedLearningItemId: "item-b" }),
      ),
    ).toBe(true);
  });

  it("a different destination level is material", () => {
    expect(
      rowMateriallyChanged(
        storedRow({ levelNumber: 1 }),
        freshRow({ levelNumber: 2 }),
      ),
    ).toBe(true);
  });

  it("a different destination group is material", () => {
    expect(
      rowMateriallyChanged(
        storedRow({ groupNumber: 1 }),
        freshRow({ groupNumber: 2 }),
      ),
    ).toBe(true);
  });

  it("a different item type is material", () => {
    expect(
      rowMateriallyChanged(
        storedRow({ itemType: "vocabulary" }),
        freshRow({ itemType: "grammar" }),
      ),
    ).toBe(true);
  });

  it("a different set of changed fields is material", () => {
    const stored = storedRow({
      classification: "update",
      changedFields: [{ field: "primaryMeaning", from: "old", to: "new" }],
    });
    const fresh = freshRow({
      classification: "update",
      changedFields: [
        { field: "primaryMeaning", from: "old", to: "different" },
      ],
    });
    expect(rowMateriallyChanged(stored, fresh)).toBe(true);
  });

  it("changed-fields order doesn't matter", () => {
    const stored = storedRow({
      classification: "update",
      changedFields: [
        { field: "a", from: "1", to: "2" },
        { field: "b", from: "3", to: "4" },
      ],
    });
    const fresh = freshRow({
      classification: "update",
      changedFields: [
        { field: "b", from: "3", to: "4" },
        { field: "a", from: "1", to: "2" },
      ],
    });
    expect(rowMateriallyChanged(stored, fresh)).toBe(false);
  });
});

describe("detectMaterialChange", () => {
  it("false when every row matches", () => {
    expect(detectMaterialChange([storedRow()], [freshRow()])).toBe(false);
  });

  it("true when the row count differs", () => {
    expect(
      detectMaterialChange(
        [storedRow()],
        [freshRow(), freshRow({ rowNumber: 2 })],
      ),
    ).toBe(true);
  });

  it("true when a fresh row has no stored counterpart", () => {
    expect(
      detectMaterialChange(
        [storedRow({ rowNumber: 1 })],
        [freshRow({ rowNumber: 2 })],
      ),
    ).toBe(true);
  });

  it("true when any one row materially changed among several unchanged ones", () => {
    const stored = [
      storedRow({ rowNumber: 1 }),
      storedRow({ rowNumber: 2, classification: "unchanged" }),
    ];
    const fresh = [
      freshRow({ rowNumber: 1 }),
      freshRow({ rowNumber: 2, classification: "update" }),
    ];
    expect(detectMaterialChange(stored, fresh)).toBe(true);
  });
});
