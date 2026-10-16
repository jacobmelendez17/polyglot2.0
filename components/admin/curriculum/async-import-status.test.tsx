import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CurriculumImportRecord,
  CurriculumImportRowRecord,
} from "@/domains/admin/server";

const actions = vi.hoisted(() => ({
  confirmAsyncCurriculumImportAction: vi.fn(),
  getCurriculumImportStatusAction: vi.fn(),
  listCurriculumImportRowsAction: vi.fn(),
  publishImportedDraftChangesAction: vi.fn(),
  resolveCurriculumImportRowAction: vi.fn(),
  reviseCurriculumImportRowAction: vi.fn(),
  retryAsyncCurriculumImportAction: vi.fn(),
}));
vi.mock("@/app/(admin)/admin/curriculum/async-import-actions", () => actions);

import { AsyncImportStatus } from "./async-import-status";

const IMPORT = "60000000-0000-4000-8000-000000000001";

function record(
  overrides: Partial<CurriculumImportRecord> = {},
): CurriculumImportRecord {
  return {
    id: IMPORT,
    environment: "development",
    languageId: "lang-1",
    originalFilename: "spanish-level-2.csv",
    fileExtension: "csv",
    s3Bucket: "bucket",
    s3Key: `imports/${IMPORT}/source.csv`,
    sourceSha256: null,
    uploadedByUserId: "user-1",
    status: "uploading",
    totalRows: 0,
    createCount: 0,
    updateCount: 0,
    moveCount: 0,
    unchangedCount: 0,
    reviewCount: 0,
    skippedCount: 0,
    previewVersion: 0,
    confirmedPreviewVersion: null,
    draftedItemIds: null,
    attemptCount: 0,
    lastErrorCode: null,
    lastErrorSummary: null,
    sourceImportId: null,
    uploadedAt: null,
    previewStartedAt: null,
    previewCompletedAt: null,
    confirmedAt: null,
    importStartedAt: null,
    completedAt: null,
    archivedAt: null,
    archivedByUserId: null,
    createdAt: new Date("2026-09-10T11:59:00Z"),
    updatedAt: new Date("2026-09-10T12:00:00Z"),
    ...overrides,
  };
}

const REVIEWABLE = {
  totalRows: 4,
  createCount: 1,
  updateCount: 1,
  moveCount: 1,
  unchangedCount: 0,
  reviewCount: 2,
  previewVersion: 1,
};

function row(
  n: number,
  overrides: Partial<CurriculumImportRowRecord> = {},
): CurriculumImportRowRecord {
  return {
    id: `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    importId: IMPORT,
    rowNumber: n,
    itemType: "vocabulary",
    displayTerm: `palabra ${n}`,
    levelNumber: 1,
    groupNumber: 1,
    classification: "create",
    previousClassification: null,
    resolvedLearningItemId: null,
    changedFields: null,
    reviewReasonCode: null,
    reviewReason: null,
    spellingWarning: null,
    adminDisposition: null,
    changedSincePreview: false,
    createdAt: new Date("2026-09-10T12:00:00Z"),
    updatedAt: new Date("2026-09-10T12:00:00Z"),
    ...overrides,
  };
}

const ok = <T,>(data: T) => ({ ok: true as const, data });
const refused = (code: string, message: string) => ({
  ok: false as const,
  error: { code, message },
});

function renderStatus(initial: CurriculumImportRecord) {
  return render(
    <AsyncImportStatus importId={IMPORT} initialRecord={initial} />,
  );
}

/** Lets the rows request the screen makes on mount finish, so a test that only looks at the first paint does not leave an update landing after it ends. */
const settled = () => waitFor(() => {});

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
  actions.listCurriculumImportRowsAction.mockResolvedValue(
    ok({ items: [], nextCursor: null }),
  );
  actions.getCurriculumImportStatusAction.mockResolvedValue(ok(record()));
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The import's own page is the specialist screen spec 26 Unit 8 leaves alone —
 * the review of rows that need a decision, the correction form, Confirm, Retry,
 * and the explicit publish of what the import drafted. These tests pin what it
 * does, so the history list's migration cannot have changed it: each status is
 * shown for what it is, polling stops when a person or nobody has the next move,
 * confirming needs every decision made, a failure can be retried, and what an
 * import drafted is never published unless an Admin says so.
 */
describe("AsyncImportStatus — a view for each status", () => {
  it.each([
    ["uploading", "Uploading curriculum…"],
    [
      "queued_for_preview",
      "Validating curriculum… The import is running in the background. You may leave this page.",
    ],
    [
      "previewing",
      "Validating curriculum… The import is running in the background. You may leave this page.",
    ],
    ["queued_for_import", "Importing… Applying the approved curriculum rows."],
    ["importing", "Importing… Applying the approved curriculum rows."],
  ] as const)(
    "says what %s means, in the pipeline's own words",
    (status, text) => {
      renderStatus(record({ status }));
      expect(screen.getByText(text)).toBeVisible();
    },
  );

  it.each([
    ["uploading", "Processing", "Uploading the file"],
    ["previewing", "Processing", "Validating rows"],
    ["importing", "Processing", "Importing"],
    ["needs_review", "Needs review", "Rows need a decision"],
    ["ready_to_import", "Ready to import", "Waiting for confirmation"],
    ["completed", "Completed", null],
    ["failed", "Failed", null],
  ] as const)(
    "puts the same badge at the top as the history list does (%s)",
    async (status, label, stage) => {
      renderStatus(record({ status, ...REVIEWABLE }));
      const region = screen.getByRole("status");
      expect(within(region).getByText(label)).toBeVisible();
      if (stage) expect(within(region).getByText(stage)).toBeVisible();
      await settled();
    },
  );

  it("shows no review table, and no Confirm, while the pipeline is still working", () => {
    renderStatus(record({ status: "previewing" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm Import" })).toBeNull();
  });

  it("does not ask for rows to review until there are some", () => {
    renderStatus(record({ status: "queued_for_preview" }));
    expect(actions.listCurriculumImportRowsAction).not.toHaveBeenCalled();
  });
});

describe("AsyncImportStatus — refreshing while the pipeline works", () => {
  it("asks again every few seconds, shows the new status, and stops when it reaches one that waits for a person", async () => {
    vi.useFakeTimers();
    actions.getCurriculumImportStatusAction
      .mockResolvedValueOnce(ok(record({ status: "previewing" })))
      .mockResolvedValue(ok(record({ status: "needs_review", ...REVIEWABLE })));
    renderStatus(record({ status: "queued_for_preview" }));
    expect(actions.getCurriculumImportStatusAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(actions.getCurriculumImportStatusAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Validating rows")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(actions.getCurriculumImportStatusAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Rows need a decision")).toBeVisible();

    // It has stopped: nobody is going to move this along but a person.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(actions.getCurriculumImportStatusAction).toHaveBeenCalledTimes(2);
  });

  it.each(["needs_review", "ready_to_import", "completed", "failed"] as const)(
    "never polls an import that is %s",
    async (status) => {
      vi.useFakeTimers();
      renderStatus(record({ status, ...REVIEWABLE }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(actions.getCurriculumImportStatusAction).not.toHaveBeenCalled();
    },
  );

  it("keeps showing what it had when a refresh is refused, and tries again", async () => {
    vi.useFakeTimers();
    actions.getCurriculumImportStatusAction
      .mockResolvedValueOnce(
        refused("FORBIDDEN", "You don't have access to do that."),
      )
      .mockResolvedValue(ok(record({ status: "needs_review", ...REVIEWABLE })));
    renderStatus(record({ status: "previewing" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("Validating rows")).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("Rows need a decision")).toBeVisible();
  });
});

describe("AsyncImportStatus — review, and the Admin's confirmation", () => {
  const needsReview = () =>
    record({ status: "needs_review", ...REVIEWABLE, id: IMPORT });

  const ROWS = [
    row(1, { classification: "create", displayTerm: "comer" }),
    row(2, {
      classification: "blocked",
      displayTerm: "beber",
      reviewReason: "Level 7 has no Group 3.",
    }),
    row(3, {
      classification: "move",
      displayTerm: "gato",
      changedFields: [{ field: "level", from: "1", to: "2" }],
    }),
  ];

  it("lists the rows, says which need a decision, and keeps Confirm disabled until each has one", async () => {
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: ROWS, nextCursor: null }),
    );
    renderStatus(needsReview());

    expect(await screen.findByText("beber")).toBeVisible();
    expect(screen.getByText("Level 7 has no Group 3.")).toBeVisible();
    expect(screen.getByText("Move — Needs Approval")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm Import" }),
    ).toBeDisabled();
    expect(screen.getByText("2 rows still need a decision.")).toBeVisible();
  });

  // The screen asks for the first page of rows as soon as it opens and, from
  // then on, trusts its (still empty) list until the answer arrives — so in
  // that moment Confirm is not held back by the screen. The service is the
  // control: it counts the rows still undecided and refuses
  // (`curriculum-import-service.integration.test.ts`, "confirmation is refused
  // until it's resolved"). Recorded as found-not-fixed in the Unit 8 report;
  // this test pins what the screen does once it has the rows.
  it("offers Confirm on a ready import once every row that needed a decision has one", async () => {
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({
        items: [
          row(1),
          { ...ROWS[1]!, adminDisposition: "skip" as const },
          { ...ROWS[2]!, adminDisposition: "approve_move" as const },
        ],
        nextCursor: null,
      }),
    );
    renderStatus(record({ status: "ready_to_import", ...REVIEWABLE }));

    expect(await screen.findByText("Skipped")).toBeVisible();
    expect(screen.getByText("Move Approved")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm Import" }),
    ).toBeEnabled();
    expect(screen.queryByText(/still need/)).toBeNull();
  });

  it("offers no Confirm once the import has been confirmed", async () => {
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: [row(1)], nextCursor: null }),
    );
    renderStatus(record({ status: "queued_for_import", ...REVIEWABLE }));

    expect(await screen.findByText("palabra 1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm Import" })).toBeNull();
  });

  it("records a decision for a row, and enables Confirm when the last one is made", async () => {
    const user = userEvent.setup();
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: ROWS, nextCursor: null }),
    );
    actions.resolveCurriculumImportRowAction.mockResolvedValue(ok(undefined));
    renderStatus(needsReview());
    await screen.findByText("beber");

    const [skipBlocked, skipMove] = screen.getAllByRole("button", {
      name: "Skip",
    });
    await user.click(skipBlocked!);
    await user.click(skipMove!);

    expect(actions.resolveCurriculumImportRowAction).toHaveBeenCalledWith({
      rowId: ROWS[1]!.id,
      disposition: "skip",
    });
    expect(actions.resolveCurriculumImportRowAction).toHaveBeenCalledWith({
      rowId: ROWS[2]!.id,
      disposition: "skip",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm Import" }),
      ).toBeEnabled(),
    );
  });

  it("approves a structural move explicitly — it is never applied silently", async () => {
    const user = userEvent.setup();
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: [ROWS[2]!], nextCursor: null }),
    );
    actions.resolveCurriculumImportRowAction.mockResolvedValue(ok(undefined));
    renderStatus(needsReview());

    await user.click(
      await screen.findByRole("button", { name: "Approve Move" }),
    );

    expect(actions.resolveCurriculumImportRowAction).toHaveBeenCalledWith({
      rowId: ROWS[2]!.id,
      disposition: "approve_move",
    });
    expect(await screen.findByText("Move Approved")).toBeVisible();
  });

  it("confirms once nothing is left to decide: the action is called, and the status is read again", async () => {
    const user = userEvent.setup();
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: [row(1)], nextCursor: null }),
    );
    actions.confirmAsyncCurriculumImportAction.mockResolvedValue(
      ok({ confirmedPreviewVersion: 1 }),
    );
    actions.getCurriculumImportStatusAction.mockResolvedValue(
      ok(record({ status: "queued_for_import", ...REVIEWABLE })),
    );
    renderStatus(needsReview());
    const confirm = await screen.findByRole("button", {
      name: "Confirm Import",
    });
    await waitFor(() => expect(confirm).toBeEnabled());

    await user.click(confirm);

    expect(actions.confirmAsyncCurriculumImportAction).toHaveBeenCalledWith({
      importId: IMPORT,
    });
    expect(
      await screen.findByText(
        "Importing… Applying the approved curriculum rows.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm Import" })).toBeNull();
  });

  // Confirming is an Admin's alone (spec 26 §6). The action refuses anyone
  // else (see `async-import-actions.test.ts`); the screen shows that refusal.
  it("shows the refusal, and keeps the import where it was, when the action will not confirm", async () => {
    const user = userEvent.setup();
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: [row(1)], nextCursor: null }),
    );
    actions.confirmAsyncCurriculumImportAction.mockResolvedValue(
      refused("FORBIDDEN", "You don't have access to do that."),
    );
    renderStatus(needsReview());
    const confirm = await screen.findByRole("button", {
      name: "Confirm Import",
    });
    await waitFor(() => expect(confirm).toBeEnabled());

    await user.click(confirm);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to do that.",
    );
    expect(actions.getCurriculumImportStatusAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm Import" }),
    ).toBeEnabled();
  });

  describe("a spelling suggestion is advice, never a gate", () => {
    const suggested = row(1, {
      classification: "create",
      displayTerm: "comr",
      spellingWarning: { field: "term", original: "comr", suggested: "comer" },
    });

    it("is shown, and does not stop Confirm", async () => {
      actions.listCurriculumImportRowsAction.mockResolvedValue(
        ok({ items: [suggested], nextCursor: null }),
      );
      renderStatus(needsReview());

      expect(
        await screen.findByText(/Possible spelling issue — did you mean/),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Confirm Import" }),
      ).toBeEnabled();
    });

    it("Keep Original only dismisses it — nothing is sent", async () => {
      const user = userEvent.setup();
      actions.listCurriculumImportRowsAction.mockResolvedValue(
        ok({ items: [suggested], nextCursor: null }),
      );
      renderStatus(needsReview());

      await user.click(
        await screen.findByRole("button", { name: "Keep Original" }),
      );

      expect(screen.queryByText(/Possible spelling issue/)).toBeNull();
      expect(actions.reviseCurriculumImportRowAction).not.toHaveBeenCalled();
    });

    it("Accept corrects the word to the suggestion, which re-runs the preview", async () => {
      const user = userEvent.setup();
      actions.listCurriculumImportRowsAction.mockResolvedValue(
        ok({ items: [suggested], nextCursor: null }),
      );
      actions.reviseCurriculumImportRowAction.mockResolvedValue(ok(undefined));
      actions.getCurriculumImportStatusAction.mockResolvedValue(
        ok(record({ status: "queued_for_preview", ...REVIEWABLE })),
      );
      renderStatus(needsReview());

      await user.click(await screen.findByRole("button", { name: "Accept" }));

      expect(actions.reviseCurriculumImportRowAction).toHaveBeenCalledWith({
        rowId: suggested.id,
        corrections: { word: "comer" },
      });
      expect(await screen.findByText(/Validating curriculum…/)).toBeVisible();
    });
  });

  it("saves a correction to a row, which re-runs the preview", async () => {
    const user = userEvent.setup();
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({ items: [ROWS[1]!], nextCursor: null }),
    );
    actions.reviseCurriculumImportRowAction.mockResolvedValue(ok(undefined));
    actions.getCurriculumImportStatusAction.mockResolvedValue(
      ok(record({ status: "queued_for_preview", ...REVIEWABLE })),
    );
    renderStatus(needsReview());

    await user.click(await screen.findByRole("button", { name: "Fix Row" }));
    await user.type(screen.getByLabelText("Batch"), "1");
    await user.click(screen.getByRole("button", { name: "Save Correction" }));

    expect(actions.reviseCurriculumImportRowAction).toHaveBeenCalledWith({
      rowId: ROWS[1]!.id,
      corrections: expect.objectContaining({ group: "1" }),
    });
    expect(await screen.findByText(/Validating curriculum…/)).toBeVisible();
  });

  it("warns when the curriculum changed after the preview was made", async () => {
    actions.listCurriculumImportRowsAction.mockResolvedValue(
      ok({
        items: [row(1, { changedSincePreview: true })],
        nextCursor: null,
      }),
    );
    renderStatus({ ...needsReview(), previewVersion: 2 });

    expect(
      await screen.findByText("Import changed since preview."),
    ).toBeVisible();
    expect(screen.getByText("CHANGED SINCE PREVIEW")).toBeVisible();
  });

  it("loads more rows when there are more", async () => {
    const user = userEvent.setup();
    actions.listCurriculumImportRowsAction
      .mockResolvedValueOnce(ok({ items: [row(1)], nextCursor: "after-1" }))
      .mockResolvedValueOnce(ok({ items: [row(2)], nextCursor: null }));
    renderStatus(needsReview());

    await user.click(
      await screen.findByRole("button", { name: "Load more rows" }),
    );

    expect(await screen.findByText("palabra 2")).toBeVisible();
    expect(actions.listCurriculumImportRowsAction).toHaveBeenLastCalledWith({
      importId: IMPORT,
      cursor: "after-1",
    });
    expect(screen.queryByRole("button", { name: "Load more rows" })).toBeNull();
  });
});

describe("AsyncImportStatus — failure and recovery", () => {
  const failed = (overrides: Partial<CurriculumImportRecord> = {}) =>
    record({
      status: "failed",
      attemptCount: 3,
      lastErrorCode: "S3_READ_FAILED",
      lastErrorSummary: "The source file could not be read.",
      ...overrides,
    });

  it("says what failed, how many times it was tried, and why", () => {
    renderStatus(failed());
    expect(
      screen.getByText("Import failed (S3_READ_FAILED) after 3 attempts."),
    ).toBeVisible();
    expect(
      screen.getByText("The source file could not be read."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry Import" })).toBeVisible();
  });

  it("says what to fix when the file's header is missing columns — and that a retry will not help", () => {
    renderStatus(
      failed({
        attemptCount: 1,
        lastErrorCode: "IMPORT_PARSE_FAILED",
        lastErrorSummary: "Missing required column(s): level, group.",
      }),
    );
    expect(screen.getByText("What to fix:")).toBeVisible();
    expect(
      screen.getByText(/header row is missing: level, group/),
    ).toBeVisible();
    expect(
      screen.getByText(/retrying the same file will fail the same way/),
    ).toBeVisible();
  });

  it("adds no 'what to fix' when it has nothing to say beyond the summary", () => {
    renderStatus(
      failed({
        lastErrorCode: "IMPORT_PREVIEW_FAILED",
        lastErrorSummary: "Failed query: select 1",
      }),
    );
    expect(screen.queryByText("What to fix:")).toBeNull();
    expect(screen.getByText("Failed query: select 1")).toBeVisible();
  });

  it("counts a single attempt as one attempt", () => {
    renderStatus(failed({ attemptCount: 1 }));
    expect(
      screen.getByText("Import failed (S3_READ_FAILED) after 1 attempt."),
    ).toBeVisible();
  });

  it("retries: the action is called, and the status is read again", async () => {
    const user = userEvent.setup();
    actions.retryAsyncCurriculumImportAction.mockResolvedValue(ok(undefined));
    actions.getCurriculumImportStatusAction.mockResolvedValue(
      ok(record({ status: "queued_for_import", ...REVIEWABLE })),
    );
    renderStatus(failed());

    await user.click(screen.getByRole("button", { name: "Retry Import" }));

    expect(actions.retryAsyncCurriculumImportAction).toHaveBeenCalledWith({
      importId: IMPORT,
    });
    expect(
      await screen.findByText(
        "Importing… Applying the approved curriculum rows.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Import failed/)).toBeNull();
  });

  it("says so, and stays failed, when the retry is refused", async () => {
    const user = userEvent.setup();
    actions.retryAsyncCurriculumImportAction.mockResolvedValue(
      refused(
        "CURRICULUM_VALIDATION_FAILED",
        "Only a failed import can be retried.",
      ),
    );
    renderStatus(failed());

    await user.click(screen.getByRole("button", { name: "Retry Import" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only a failed import can be retried.",
    );
    expect(screen.getByText(/Import failed/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry Import" })).toBeEnabled();
  });

  it("does not let a retry be pressed twice while it is being sent", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    actions.retryAsyncCurriculumImportAction.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(ok(undefined));
      }),
    );
    renderStatus(failed());

    await user.click(screen.getByRole("button", { name: "Retry Import" }));

    expect(
      await screen.findByRole("button", { name: "Retrying…" }),
    ).toBeDisabled();
    release();
    await waitFor(() =>
      expect(actions.getCurriculumImportStatusAction).toHaveBeenCalled(),
    );
  });
});

describe("AsyncImportStatus — a completed import, and what it drafted", () => {
  const completed = (overrides: Partial<CurriculumImportRecord> = {}) =>
    record({
      status: "completed",
      totalRows: 61,
      createCount: 43,
      updateCount: 8,
      moveCount: 2,
      unchangedCount: 6,
      skippedCount: 2,
      previewVersion: 1,
      confirmedPreviewVersion: 1,
      ...overrides,
    });

  it("says what was done — and that everything it created is Pending, not live", () => {
    renderStatus(completed());
    expect(screen.getByText("Import complete.")).toBeVisible();
    expect(
      screen.getByText(
        /61 rows processed — 43 created, 8 updated, 2 moved, 6 unchanged, 2 skipped\. All newly created content is Pending\./,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "View curriculum" }),
    ).toHaveAttribute("href", "/admin/curriculum");
  });

  it("offers no publish when the import drafted nothing", () => {
    renderStatus(completed({ draftedItemIds: [] }));
    expect(
      screen.queryByRole("button", { name: /Publish All Eligible/ }),
    ).toBeNull();
  });

  // The distinction the spec insists on: committing an import is not
  // publishing it. Published items it changed wait in a draft until an Admin
  // says so.
  it("says published items now have draft changes, and publishes nothing until it is told to", async () => {
    renderStatus(completed({ draftedItemIds: ["item-1", "item-2"] }));

    expect(
      screen.getByText("2 published items now have draft changes."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Publish All Eligible Imported Changes",
      }),
    ).toBeEnabled();
    await settled();
    expect(actions.publishImportedDraftChangesAction).not.toHaveBeenCalled();
  });

  it("publishes them on request, under a fresh key, and reports how many went and how many no longer had a draft", async () => {
    const user = userEvent.setup();
    actions.publishImportedDraftChangesAction.mockResolvedValue(
      ok({ publishedItemIds: ["item-1"], skippedItemIds: ["item-2"] }),
    );
    renderStatus(completed({ draftedItemIds: ["item-1", "item-2"] }));

    await user.click(
      screen.getByRole("button", {
        name: "Publish All Eligible Imported Changes",
      }),
    );

    expect(actions.publishImportedDraftChangesAction).toHaveBeenCalledWith({
      importId: IMPORT,
      idempotencyKey: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    });
    expect(
      await screen.findByText(
        "Published 1 item; 1 no longer had a draft to publish.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Publish All Eligible/ }),
    ).toBeNull();
  });

  it("shows the refusal, and offers the publish again, when it fails", async () => {
    const user = userEvent.setup();
    actions.publishImportedDraftChangesAction.mockResolvedValue(
      refused("RATE_LIMITED", "Please slow down and try again in 9s."),
    );
    renderStatus(completed({ draftedItemIds: ["item-1"] }));

    await user.click(
      screen.getByRole("button", {
        name: "Publish All Eligible Imported Changes",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please slow down and try again in 9s.",
    );
    expect(
      screen.getByRole("button", {
        name: "Publish All Eligible Imported Changes",
      }),
    ).toBeEnabled();
  });
});
