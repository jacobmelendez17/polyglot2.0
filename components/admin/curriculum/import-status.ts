import type { AdminImportRow, AdminImportStatus } from "@/domains/admin";

/**
 * How an import's status is put to a person (spec 26 Unit 8) — one place for the
 * history list and the import's own page, so a status never reads two ways.
 * Pure, so every rule is stated and tested without rendering anything.
 *
 * The five statuses where the background pipeline is working all read
 * "Processing", as the history always said; `stage` says which, for a screen
 * with room. Status is never colour alone: the badge pairs `tone` with an icon
 * and the label.
 */

export type ImportStatusTone = "success" | "warning" | "error" | "neutral";
export type ImportStatusIcon =
  "check" | "alert" | "review" | "waiting" | "processing";

export type ImportStatusView = {
  /** The word the badge shows. */
  label: string;
  tone: ImportStatusTone;
  icon: ImportStatusIcon;
  /** A few words on where it is, or what it is waiting for; `null` when the label says it all. */
  stage: string | null;
};

const PROCESSING = {
  label: "Processing",
  tone: "neutral",
  icon: "processing",
} as const;

const VIEWS: Record<AdminImportStatus, ImportStatusView> = {
  uploading: { ...PROCESSING, stage: "Uploading the file" },
  queued_for_preview: { ...PROCESSING, stage: "Waiting to validate" },
  previewing: { ...PROCESSING, stage: "Validating rows" },
  needs_review: {
    label: "Needs review",
    tone: "warning",
    icon: "review",
    stage: "Rows need a decision",
  },
  ready_to_import: {
    label: "Ready to import",
    tone: "warning",
    icon: "waiting",
    stage: "Waiting for confirmation",
  },
  queued_for_import: { ...PROCESSING, stage: "Waiting to import" },
  importing: { ...PROCESSING, stage: "Importing" },
  completed: {
    label: "Completed",
    tone: "success",
    icon: "check",
    stage: null,
  },
  failed: { label: "Failed", tone: "error", icon: "alert", stage: null },
};

export function importStatusView(status: AdminImportStatus): ImportStatusView {
  return VIEWS[status];
}

/**
 * The statuses in which the background pipeline is doing the work, so the status
 * will change without anyone touching it. The others wait for a person (review,
 * confirmation) or are final (completed, failed). Matches what the import's own
 * page polls until.
 */
const WORKING: ReadonlySet<AdminImportStatus> = new Set([
  "uploading",
  "queued_for_preview",
  "previewing",
  "queued_for_import",
  "importing",
]);

export function isPipelineWorking(status: AdminImportStatus): boolean {
  return WORKING.has(status);
}

/** Before the preview has read the file there is nothing to count: zero would be a claim. */
const NOT_COUNTED_YET: ReadonlySet<AdminImportStatus> = new Set([
  "uploading",
  "queued_for_preview",
  "previewing",
]);

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

type Summarized = Pick<
  AdminImportRow,
  | "status"
  | "totalRows"
  | "createCount"
  | "updateCount"
  | "moveCount"
  | "skippedCount"
  | "reviewCount"
  | "attemptCount"
>;

/**
 * What an import found, in one line. Until the import has *completed* the counts
 * are the preview's — what it would do — so they are worded that way ("to
 * create"), never as if it had happened; a completed import says what it did.
 */
export function summarizeImport(row: Summarized): string {
  // An import that failed before the preview counted anything is the same: it
  // has no rows to report, and "0 rows · 0 to create" would say it read an empty
  // file. (One that failed while committing has the preview's counts.)
  if (
    row.totalRows === 0 &&
    (NOT_COUNTED_YET.has(row.status) || row.status === "failed")
  ) {
    return [
      "Not counted yet",
      ...(row.status === "failed" && row.attemptCount > 0
        ? [plural(row.attemptCount, "attempt")]
        : []),
    ].join(" · ");
  }

  const done = row.status === "completed";
  const parts = [
    plural(row.totalRows, "row"),
    ...(row.status === "needs_review" && row.reviewCount > 0
      ? [`${row.reviewCount} need${row.reviewCount === 1 ? "s" : ""} review`]
      : []),
    done ? `${row.createCount} created` : `${row.createCount} to create`,
    done ? `${row.updateCount} updated` : `${row.updateCount} to update`,
    done ? `${row.moveCount} moved` : `${row.moveCount} to move`,
    ...(row.skippedCount > 0 ? [`${row.skippedCount} skipped`] : []),
    ...(row.status === "failed" && row.attemptCount > 0
      ? [plural(row.attemptCount, "attempt")]
      : []),
  ];
  return parts.join(" · ");
}
