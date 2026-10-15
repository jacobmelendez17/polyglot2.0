import { describe, expect, it } from "vitest";

import { curriculumImportStatusEnum } from "@/db/schema";
import { IMPORT_STATUSES, type AdminImportStatus } from "@/domains/admin";

import {
  importStatusView,
  isPipelineWorking,
  summarizeImport,
} from "./import-status";

const row = (
  status: AdminImportStatus,
  overrides: Partial<Parameters<typeof summarizeImport>[0]> = {},
) => ({
  status,
  totalRows: 61,
  createCount: 43,
  updateCount: 8,
  moveCount: 2,
  skippedCount: 0,
  reviewCount: 0,
  attemptCount: 0,
  ...overrides,
});

describe("the statuses an import can have", () => {
  it("are exactly the ones the database has — the contract cannot drift from the enum", () => {
    expect([...IMPORT_STATUSES]).toEqual([
      ...curriculumImportStatusEnum.enumValues,
    ]);
  });

  it("each have a view of their own", () => {
    for (const status of IMPORT_STATUSES) {
      const view = importStatusView(status);
      expect(view.label.length, status).toBeGreaterThan(0);
    }
  });
});

describe("importStatusView", () => {
  it.each([
    ["completed", "Completed", "success", "check", null],
    ["failed", "Failed", "error", "alert", null],
    [
      "needs_review",
      "Needs review",
      "warning",
      "review",
      "Rows need a decision",
    ],
    [
      "ready_to_import",
      "Ready to import",
      "warning",
      "waiting",
      "Waiting for confirmation",
    ],
  ] as const)("says %s as %s", (status, label, tone, icon, stage) => {
    expect(importStatusView(status)).toEqual({ label, tone, icon, stage });
  });

  it.each([
    ["uploading", "Uploading the file"],
    ["queued_for_preview", "Waiting to validate"],
    ["previewing", "Validating rows"],
    ["queued_for_import", "Waiting to import"],
    ["importing", "Importing"],
  ] as const)(
    "calls %s Processing, and says which stage in a few words",
    (status, stage) => {
      expect(importStatusView(status)).toEqual({
        label: "Processing",
        tone: "neutral",
        icon: "processing",
        stage,
      });
    },
  );

  it("never leaves a status to colour alone: every view has an icon and a label", () => {
    for (const status of IMPORT_STATUSES) {
      const { icon, label } = importStatusView(status);
      expect(icon).toBeTruthy();
      expect(label).toBeTruthy();
    }
  });
});

describe("isPipelineWorking", () => {
  it("is true while the background pipeline has the work, and false when a person or nobody does", () => {
    const working = IMPORT_STATUSES.filter(isPipelineWorking);
    expect(working).toEqual([
      "uploading",
      "queued_for_preview",
      "previewing",
      "queued_for_import",
      "importing",
    ]);
    for (const waiting of [
      "needs_review",
      "ready_to_import",
      "completed",
      "failed",
    ] as const) {
      expect(isPipelineWorking(waiting), waiting).toBe(false);
    }
  });
});

describe("summarizeImport", () => {
  it("says what a completed import did", () => {
    expect(summarizeImport(row("completed"))).toBe(
      "61 rows · 43 created · 8 updated · 2 moved",
    );
  });

  it("says what an import that has not completed would do — never as if it had", () => {
    expect(summarizeImport(row("ready_to_import"))).toBe(
      "61 rows · 43 to create · 8 to update · 2 to move",
    );
    expect(summarizeImport(row("importing"))).toBe(
      "61 rows · 43 to create · 8 to update · 2 to move",
    );
  });

  it("puts what needs a decision first, with the right verb for one or many", () => {
    expect(summarizeImport(row("needs_review", { reviewCount: 2 }))).toBe(
      "61 rows · 2 need review · 43 to create · 8 to update · 2 to move",
    );
    expect(summarizeImport(row("needs_review", { reviewCount: 1 }))).toContain(
      "1 needs review",
    );
    expect(
      summarizeImport(row("needs_review", { reviewCount: 0 })),
    ).not.toContain("review ·");
  });

  it("counts a single row as one row", () => {
    expect(
      summarizeImport(
        row("completed", {
          totalRows: 1,
          createCount: 1,
          updateCount: 0,
          moveCount: 0,
        }),
      ),
    ).toBe("1 row · 1 created · 0 updated · 0 moved");
  });

  it("mentions what was skipped, only when something was", () => {
    expect(summarizeImport(row("completed", { skippedCount: 3 }))).toBe(
      "61 rows · 43 created · 8 updated · 2 moved · 3 skipped",
    );
  });

  it("says how many times a failed import was attempted", () => {
    expect(summarizeImport(row("failed", { attemptCount: 3 }))).toBe(
      "61 rows · 43 to create · 8 to update · 2 to move · 3 attempts",
    );
    expect(summarizeImport(row("failed", { attemptCount: 1 }))).toContain(
      "1 attempt",
    );
    expect(summarizeImport(row("failed", { attemptCount: 1 }))).not.toContain(
      "attempts",
    );
  });

  it.each(["uploading", "queued_for_preview", "previewing"] as const)(
    "does not claim zero rows for a %s import the preview has not read yet",
    (status) => {
      expect(
        summarizeImport(
          row(status, {
            totalRows: 0,
            createCount: 0,
            updateCount: 0,
            moveCount: 0,
          }),
        ),
      ).toBe("Not counted yet");
    },
  );

  // A failure before the preview counted anything leaves every count at zero;
  // reporting them would say the file was read and found empty.
  it("does not claim zero rows for an import that failed before anything was counted — and still says how often it was tried", () => {
    const uncounted = {
      totalRows: 0,
      createCount: 0,
      updateCount: 0,
      moveCount: 0,
    };
    expect(
      summarizeImport(row("failed", { ...uncounted, attemptCount: 3 })),
    ).toBe("Not counted yet · 3 attempts");
    expect(
      summarizeImport(row("failed", { ...uncounted, attemptCount: 1 })),
    ).toBe("Not counted yet · 1 attempt");
    expect(
      summarizeImport(row("failed", { ...uncounted, attemptCount: 0 })),
    ).toBe("Not counted yet");
  });

  it("keeps the counts of an import that failed while committing — the preview did count them", () => {
    expect(summarizeImport(row("failed", { attemptCount: 2 }))).toBe(
      "61 rows · 43 to create · 8 to update · 2 to move · 2 attempts",
    );
  });

  it("does count an empty file once it has been read", () => {
    expect(
      summarizeImport(
        row("completed", {
          totalRows: 0,
          createCount: 0,
          updateCount: 0,
          moveCount: 0,
        }),
      ),
    ).toBe("0 rows · 0 created · 0 updated · 0 moved");
  });
});
