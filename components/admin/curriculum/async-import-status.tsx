"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NEW_HOMONYM_SENTINEL } from "@/domains/curriculum/vocabulary-import-parsing";
import type {
  BulkPublishDraftedItemsResult,
  CurriculumImportRecord,
  CurriculumImportRowRecord,
  CurriculumImportStatus,
} from "@/domains/admin/server";

import {
  confirmAsyncCurriculumImportAction,
  getCurriculumImportStatusAction,
  listCurriculumImportRowsAction,
  publishImportedDraftChangesAction,
  resolveCurriculumImportRowAction,
  reviseCurriculumImportRowAction,
  retryAsyncCurriculumImportAction,
} from "@/app/(admin)/admin/curriculum/async-import-actions";

/** Spec 25 §10.1/§10.2/§12 — the correction form's fields, matched to the spec's own worked examples (a wrong batch/level number, an unknown/ambiguous key, a deliberate homonym, a manually-corrected spelling). Every other importable field is already reachable through an ordinary re-upload (Unit 4). */
type RowCorrectionDraft = {
  word: string;
  curriculum_key: string;
  level: string;
  group: string;
  level_name: string;
  group_name: string;
  forceNewHomonym: boolean;
};

const EMPTY_DRAFT: RowCorrectionDraft = {
  word: "",
  curriculum_key: "",
  level: "",
  group: "",
  level_name: "",
  group_name: "",
  forceNewHomonym: false,
};

type AsyncImportStatusProps = {
  importId: string;
  initialRecord: CurriculumImportRecord;
};

// Spec 19 §38 — poll every few seconds; stop once a terminal/user-action
// state is reached.
const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: CurriculumImportStatus[] = [
  "needs_review",
  "ready_to_import",
  "completed",
  "failed",
];
const REVIEW_STATUSES: CurriculumImportStatus[] = [
  "needs_review",
  "ready_to_import",
  "queued_for_import",
  "importing",
  "completed",
];

function statusMessage(status: CurriculumImportStatus): string {
  switch (status) {
    case "uploading":
      return "Uploading curriculum…";
    case "queued_for_preview":
    case "previewing":
      return "Validating curriculum… The import is running in the background. You may leave this page.";
    case "queued_for_import":
    case "importing":
      return "Importing… Applying the approved curriculum rows.";
    default:
      return "";
  }
}

function classificationLabel(row: CurriculumImportRowRecord): {
  text: string;
  className: string;
} {
  switch (row.classification) {
    case "create":
      return { text: "New", className: "text-state-success" };
    case "update":
      return { text: "Update", className: "text-foreground" };
    case "move":
      return {
        // Spec 25 §10.3 — a move is never applied silently, so its label
        // reflects whether it still needs an explicit approval the same way
        // a blocked row's label already reflects its own disposition.
        text:
          row.adminDisposition === "approve_move"
            ? "Move Approved"
            : row.adminDisposition === "skip"
              ? "Move Skipped"
              : "Move — Needs Approval",
        className: row.adminDisposition
          ? "text-muted-foreground"
          : "text-state-warning",
      };
    case "unchanged":
      return { text: "Unchanged", className: "text-muted-foreground" };
    case "blocked":
      return {
        text: row.adminDisposition === "skip" ? "Skipped" : "Needs review",
        className: row.adminDisposition
          ? "text-muted-foreground"
          : "text-state-error",
      };
  }
}

export function AsyncImportStatus({
  importId,
  initialRecord,
}: AsyncImportStatusProps) {
  const [record, setRecord] = useState<CurriculumImportRecord>(initialRecord);
  const [rows, setRows] = useState<CurriculumImportRowRecord[]>([]);
  const [rowsCursor, setRowsCursor] = useState<string | null>(null);
  // Tracks which preview version is currently loaded, rather than a plain
  // loaded/not-loaded flag — a row correction (spec 25 §10.2) or a stale-
  // preview commit revalidation (§10.4) both bump `previewVersion` on the
  // *same* import the page already has open, and the row list must reload
  // to show the new classifications rather than looking permanently stale.
  const [loadedPreviewVersion, setLoadedPreviewVersion] = useState<
    number | null
  >(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowCorrectionDraft>(EMPTY_DRAFT);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [publishingDrafts, setPublishingDrafts] = useState(false);
  const [draftsPublishResult, setDraftsPublishResult] =
    useState<BulkPublishDraftedItemsResult | null>(null);
  const [revising, setRevising] = useState(false);
  // Spec 25 §12 — "Keep Original" needs no server round trip (the warning is
  // purely advisory and never blocks anything); a client-only dismiss is
  // enough, and it naturally resets on the next real preview anyway (a new
  // row id).
  const [dismissedSpellingWarningRowIds, setDismissedSpellingWarningRowIds] =
    useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(
    async (cursor: string | null) => {
      const result = await listCurriculumImportRowsAction({ importId, cursor });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRows((prev) =>
        cursor ? [...prev, ...result.data.items] : result.data.items,
      );
      setRowsCursor(result.data.nextCursor);
    },
    [importId],
  );

  // Poll for status until a terminal/user-action state is reached (spec 19 §38).
  useEffect(() => {
    if (TERMINAL_STATUSES.includes(record.status)) return;

    const interval = setInterval(async () => {
      const result = await getCurriculumImportStatusAction({ importId });
      if (!result.ok || !result.data) return;
      setRecord(result.data);
      if (TERMINAL_STATUSES.includes(result.data.status))
        clearInterval(interval);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [importId, record.status]);

  // Load the row list whenever the import has something to review under a
  // preview version this page hasn't fetched yet. Fetching in response to a
  // status/version change is the correct use of an effect here (an external
  // condition changed, not a render-time computation); the fetch itself is
  // async and its state updates land after the network round trip, not
  // synchronously within this effect body.
  useEffect(() => {
    if (
      REVIEW_STATUSES.includes(record.status) &&
      loadedPreviewVersion !== record.previewVersion
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadRows(null);
      setLoadedPreviewVersion(record.previewVersion);
    }
  }, [record.status, record.previewVersion, loadedPreviewVersion, loadRows]);

  async function handleResolve(
    rowId: string,
    disposition: "skip" | "approve_move",
  ) {
    setPendingRowId(rowId);
    setError(null);
    const result = await resolveCurriculumImportRowAction({
      rowId,
      disposition,
    });
    setPendingRowId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, adminDisposition: disposition } : row,
      ),
    );
  }

  /** Spec 25 §10.1/§10.2 — saves the row's correction and re-triggers preview; the row list refreshes once `record.previewVersion` bumps (see the effect above), so there's nothing to optimistically patch into `rows` here — the real reclassification is the point. */
  async function handleRevise(rowId: string) {
    const corrections: Record<string, string> = {
      word: draft.word.trim(),
      curriculum_key: draft.forceNewHomonym
        ? NEW_HOMONYM_SENTINEL
        : draft.curriculum_key.trim(),
      level: draft.level.trim(),
      group: draft.group.trim(),
      level_name: draft.level_name.trim(),
      group_name: draft.group_name.trim(),
    };
    setRevising(true);
    setError(null);
    const result = await reviseCurriculumImportRowAction({
      rowId,
      corrections,
    });
    setRevising(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEditingRowId(null);
    setDraft(EMPTY_DRAFT);
    const refreshed = await getCurriculumImportStatusAction({ importId });
    if (refreshed.ok && refreshed.data) setRecord(refreshed.data);
  }

  /** Spec 25 §12's "Accept suggestion" — corrects the row's own word/term to the suggested spelling and re-triggers preview, same as any other row correction. */
  async function handleAcceptSpelling(row: CurriculumImportRowRecord) {
    if (!row.spellingWarning) return;
    const corrections: Record<string, string> = {
      word: row.spellingWarning.suggested,
    };
    setPendingRowId(row.id);
    setError(null);
    const result = await reviseCurriculumImportRowAction({
      rowId: row.id,
      corrections,
    });
    setPendingRowId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const refreshed = await getCurriculumImportStatusAction({ importId });
    if (refreshed.ok && refreshed.data) setRecord(refreshed.data);
  }

  async function handleRetry() {
    setRetrying(true);
    setError(null);
    const result = await retryAsyncCurriculumImportAction({ importId });
    setRetrying(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const refreshed = await getCurriculumImportStatusAction({ importId });
    if (refreshed.ok && refreshed.data) setRecord(refreshed.data);
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    const result = await confirmAsyncCurriculumImportAction({ importId });
    setConfirming(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const refreshed = await getCurriculumImportStatusAction({ importId });
    if (refreshed.ok && refreshed.data) setRecord(refreshed.data);
  }

  /** Spec 25 §14.3 — a partial result (some items skipped) is the normal outcome, not an error; see `bulkPublishDraftedItems`'s own docstring. */
  async function handlePublishDrafts() {
    setPublishingDrafts(true);
    setError(null);
    const result = await publishImportedDraftChangesAction({
      importId,
      idempotencyKey: crypto.randomUUID(),
    });
    setPublishingDrafts(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDraftsPublishResult(result.data);
  }

  const unresolvedCount = rows.filter(
    (row) =>
      (row.classification === "blocked" || row.classification === "move") &&
      !row.adminDisposition,
  ).length;
  const message = statusMessage(record.status);

  return (
    <div className="flex flex-col gap-4">
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}

      {record.status === "failed" ? (
        <div className="rounded-xl border border-state-error/30 bg-state-error/5 p-4">
          <p className="text-sm font-medium text-state-error">
            Import failed
            {record.lastErrorCode
              ? ` (${record.lastErrorCode})`
              : ""} after {record.attemptCount} attempt
            {record.attemptCount === 1 ? "" : "s"}.
          </p>
          {record.lastErrorSummary ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {record.lastErrorSummary}
            </p>
          ) : null}
          <Button className="mt-3" disabled={retrying} onClick={handleRetry}>
            {retrying ? "Retrying…" : "Retry Import"}
          </Button>
        </div>
      ) : null}

      {record.status === "completed" ? (
        <div className="rounded-xl border border-state-success/30 bg-state-success/5 p-4">
          <p className="text-sm font-medium text-foreground">
            Import complete.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.totalRows} row{record.totalRows === 1 ? "" : "s"} processed
            — {record.createCount} created, {record.updateCount} updated,{" "}
            {record.moveCount} moved, {record.unchangedCount} unchanged
            {record.skippedCount > 0 ? `, ${record.skippedCount} skipped` : ""}.
            All newly created content is Pending.
          </p>
          {/* Spec 25 §14.3 — bulk-publishing what the import itself drafted (never live-overwritten published content). New pending items already have their own existing bulk-publish path from the curriculum table. */}
          {record.draftedItemIds && record.draftedItemIds.length > 0 ? (
            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              {draftsPublishResult ? (
                <p className="text-sm text-muted-foreground">
                  Published {draftsPublishResult.publishedItemIds.length} item
                  {draftsPublishResult.publishedItemIds.length === 1 ? "" : "s"}
                  {draftsPublishResult.skippedItemIds.length > 0
                    ? `; ${draftsPublishResult.skippedItemIds.length} no longer had a draft to publish`
                    : ""}
                  .
                </p>
              ) : (
                <>
                  <p className="text-sm text-foreground">
                    {record.draftedItemIds.length} published item
                    {record.draftedItemIds.length === 1 ? "" : "s"} now have
                    draft changes.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={publishingDrafts}
                    onClick={handlePublishDrafts}
                  >
                    {publishingDrafts
                      ? "Publishing…"
                      : "Publish All Eligible Imported Changes"}
                  </Button>
                </>
              )}
            </div>
          ) : null}
          <Button asChild className="mt-3">
            <Link href="/admin/curriculum">View curriculum</Link>
          </Button>
        </div>
      ) : null}

      {REVIEW_STATUSES.includes(record.status) &&
      record.status !== "completed" ? (
        <>
          {record.previewVersion > 1 &&
          rows.some((row) => row.changedSincePreview) ? (
            <div className="rounded-xl border border-state-warning/30 bg-state-warning/5 p-3">
              <p className="text-sm font-medium text-state-warning">
                Import changed since preview.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Curriculum changed after this preview was generated. Review the
                updated rows (marked below) before confirming again.
              </p>
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {record.totalRows} row{record.totalRows === 1 ? "" : "s"} —{" "}
            {record.createCount} create, {record.updateCount} update,{" "}
            {record.moveCount} move, {record.unchangedCount} unchanged,{" "}
            {record.reviewCount} needs review.
          </p>

          {rows.length > 0 ? (
            <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-border [contain:paint]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th scope="col" className="px-3 py-2">
                      Row
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Term
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Level
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Details
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const label = classificationLabel(row);
                    const needsDisposition =
                      (row.classification === "blocked" ||
                        row.classification === "move") &&
                      !row.adminDisposition;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-2">
                            {row.displayTerm ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            {row.levelNumber ?? "—"}
                          </td>
                          <td className={`px-3 py-2 ${label.className}`}>
                            {label.text}
                            {row.changedSincePreview ? (
                              <span className="ml-2 text-xs font-medium text-state-warning">
                                CHANGED SINCE PREVIEW
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.reviewReason ?? "—"}
                            {/* Spec 25 §13.1 — provenance: a changed field this row's own file cell never supplied. */}
                            {row.changedFields?.some(
                              (change) => change.source === "dictionary",
                            ) ? (
                              <p className="mt-1 text-xs italic">
                                {row.changedFields
                                  .filter(
                                    (change) => change.source === "dictionary",
                                  )
                                  .map((change) => change.field)
                                  .join(", ")}{" "}
                                filled from dictionary
                              </p>
                            ) : null}
                            {/* Spec 25 §12 — advisory spelling suggestion; never blocks anything. */}
                            {row.spellingWarning &&
                            !dismissedSpellingWarningRowIds.has(row.id) ? (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-state-warning">
                                <span>
                                  Possible spelling issue — did you mean &ldquo;
                                  {row.spellingWarning.suggested}&rdquo;?
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pendingRowId === row.id}
                                  onClick={() => handleAcceptSpelling(row)}
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setDismissedSpellingWarningRowIds((prev) =>
                                      new Set(prev).add(row.id),
                                    )
                                  }
                                >
                                  Keep Original
                                </Button>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {needsDisposition ||
                            (row.spellingWarning &&
                              !dismissedSpellingWarningRowIds.has(row.id)) ? (
                              <div className="flex gap-2">
                                {row.classification === "move" ? (
                                  <Button
                                    size="sm"
                                    disabled={pendingRowId === row.id}
                                    onClick={() =>
                                      handleResolve(row.id, "approve_move")
                                    }
                                  >
                                    Approve Move
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pendingRowId === row.id}
                                  onClick={() => {
                                    setEditingRowId(
                                      editingRowId === row.id ? null : row.id,
                                    );
                                    setDraft(EMPTY_DRAFT);
                                  }}
                                >
                                  {editingRowId === row.id
                                    ? "Cancel Fix"
                                    : "Fix Row"}
                                </Button>
                                {needsDisposition ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={pendingRowId === row.id}
                                    onClick={() =>
                                      handleResolve(row.id, "skip")
                                    }
                                  >
                                    Skip
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                        {editingRowId === row.id ? (
                          <tr className="border-b border-border bg-muted/30 last:border-0">
                            <td colSpan={6} className="px-3 py-3">
                              {/* Spec 25 §10.2 — a blank field means "no correction,
                              use the source file's own value"; §10.1's explicit
                              homonym escape hatch overrides the curriculum-key
                              field outright when checked. */}
                              <div className="flex flex-wrap items-end gap-3">
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Word
                                  <Input
                                    className="w-32"
                                    value={draft.word}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        word: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Curriculum key
                                  <Input
                                    className="w-48"
                                    value={draft.curriculum_key}
                                    disabled={draft.forceNewHomonym}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        curriculum_key: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Level
                                  <Input
                                    className="w-20"
                                    value={draft.level}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        level: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Batch
                                  <Input
                                    className="w-20"
                                    value={draft.group}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        group: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Level name
                                  <Input
                                    className="w-40"
                                    value={draft.level_name}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        level_name: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                  Batch name
                                  <Input
                                    className="w-40"
                                    value={draft.group_name}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        group_name: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="flex items-center gap-2 pb-1.5 text-xs text-muted-foreground">
                                  <Checkbox
                                    checked={draft.forceNewHomonym}
                                    onCheckedChange={(checked) =>
                                      setDraft((d) => ({
                                        ...d,
                                        forceNewHomonym: checked === true,
                                      }))
                                    }
                                  />
                                  Create as a new, separate homonym
                                </label>
                                <Button
                                  size="sm"
                                  disabled={revising}
                                  onClick={() => handleRevise(row.id)}
                                >
                                  {revising ? "Saving…" : "Save Correction"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {rowsCursor ? (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => loadRows(rowsCursor)}
            >
              Load more rows
            </Button>
          ) : null}

          {record.status === "needs_review" ||
          record.status === "ready_to_import" ? (
            <div className="flex items-center gap-3">
              {/* Gated on loadedPreviewVersion, not just unresolvedCount === 0
                  — an empty, not-yet-fetched rows array also computes to
                  zero unresolved, which would briefly show Confirm as
                  enabled before there's any real data behind that claim
                  (found via real-browser verification, spec 19 unit 12-13). */}
              <Button
                onClick={handleConfirm}
                disabled={
                  confirming ||
                  loadedPreviewVersion === null ||
                  unresolvedCount > 0
                }
              >
                Confirm Import
              </Button>
              {loadedPreviewVersion === null ? (
                <p className="text-sm text-muted-foreground">Loading rows…</p>
              ) : unresolvedCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {unresolvedCount} row{unresolvedCount === 1 ? "" : "s"} still
                  need{unresolvedCount === 1 ? "s" : ""} a decision.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
