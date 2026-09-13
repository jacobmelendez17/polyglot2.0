"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CurriculumImportRecord, CurriculumImportRowRecord, CurriculumImportStatus } from "@/domains/admin/server";

import {
  confirmAsyncCurriculumImportAction,
  getCurriculumImportStatusAction,
  listCurriculumImportRowsAction,
  resolveCurriculumImportRowAction,
  retryAsyncCurriculumImportAction,
} from "@/app/(admin)/admin/curriculum/async-import-actions";

type AsyncImportStatusProps = {
  importId: string;
  initialRecord: CurriculumImportRecord;
};

// Spec 19 §38 — poll every few seconds; stop once a terminal/user-action
// state is reached.
const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES: CurriculumImportStatus[] = ["needs_review", "ready_to_import", "completed", "failed"];
const REVIEW_STATUSES: CurriculumImportStatus[] = ["needs_review", "ready_to_import", "queued_for_import", "importing", "completed"];

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

function classificationLabel(row: CurriculumImportRowRecord): { text: string; className: string } {
  switch (row.classification) {
    case "create":
      return { text: "New", className: "text-state-success" };
    case "update":
      return { text: "Update", className: "text-foreground" };
    case "move":
      return { text: "Move", className: "text-state-warning" };
    case "unchanged":
      return { text: "Unchanged", className: "text-muted-foreground" };
    case "blocked":
      return { text: row.adminDisposition === "skip" ? "Skipped" : "Needs review", className: row.adminDisposition ? "text-muted-foreground" : "text-state-error" };
  }
}

export function AsyncImportStatus({ importId, initialRecord }: AsyncImportStatusProps) {
  const [record, setRecord] = useState<CurriculumImportRecord>(initialRecord);
  const [rows, setRows] = useState<CurriculumImportRowRecord[]>([]);
  const [rowsCursor, setRowsCursor] = useState<string | null>(null);
  const [rowsLoaded, setRowsLoaded] = useState(false);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(
    async (cursor: string | null) => {
      const result = await listCurriculumImportRowsAction({ importId, cursor });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setRows((prev) => (cursor ? [...prev, ...result.data.items] : result.data.items));
      setRowsCursor(result.data.nextCursor);
      setRowsLoaded(true);
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
      if (TERMINAL_STATUSES.includes(result.data.status)) clearInterval(interval);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [importId, record.status]);

  // Load the row list once the import has something to review. Fetching in
  // response to a status change is the correct use of an effect here (an
  // external condition changed, not a render-time computation); the fetch
  // itself is async and its state updates land after the network round
  // trip, not synchronously within this effect body.
  useEffect(() => {
    if (!rowsLoaded && REVIEW_STATUSES.includes(record.status)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadRows(null);
    }
  }, [record.status, rowsLoaded, loadRows]);

  async function handleResolve(rowId: string) {
    setPendingRowId(rowId);
    setError(null);
    const result = await resolveCurriculumImportRowAction({ rowId });
    setPendingRowId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, adminDisposition: "skip" } : row)));
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

  const unresolvedCount = rows.filter((row) => row.classification === "blocked" && !row.adminDisposition).length;
  const message = statusMessage(record.status);

  return (
    <div className="flex flex-col gap-4">
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      {record.status === "failed" ? (
        <div className="rounded-xl border border-state-error/30 bg-state-error/5 p-4">
          <p className="text-sm font-medium text-state-error">
            Import failed{record.lastErrorCode ? ` (${record.lastErrorCode})` : ""} after {record.attemptCount} attempt
            {record.attemptCount === 1 ? "" : "s"}.
          </p>
          {record.lastErrorSummary ? <p className="mt-1 text-sm text-muted-foreground">{record.lastErrorSummary}</p> : null}
          <Button className="mt-3" disabled={retrying} onClick={handleRetry}>
            {retrying ? "Retrying…" : "Retry Import"}
          </Button>
        </div>
      ) : null}

      {record.status === "completed" ? (
        <div className="rounded-xl border border-state-success/30 bg-state-success/5 p-4">
          <p className="text-sm font-medium text-foreground">Import complete.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.createCount} created, {record.updateCount} updated, {record.moveCount} moved, {record.unchangedCount} unchanged
            {record.skippedCount > 0 ? `, ${record.skippedCount} skipped` : ""}. All newly created content is Pending.
          </p>
          <Button asChild className="mt-3">
            <Link href="/admin/curriculum">View curriculum</Link>
          </Button>
        </div>
      ) : null}

      {REVIEW_STATUSES.includes(record.status) && record.status !== "completed" ? (
        <>
          {record.previewVersion > 1 && rows.some((row) => row.changedSincePreview) ? (
            <div className="rounded-xl border border-state-warning/30 bg-state-warning/5 p-3">
              <p className="text-sm font-medium text-state-warning">Import changed since preview.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Curriculum changed after this preview was generated. Review the updated rows (marked below) before confirming again.
              </p>
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {record.totalRows} row{record.totalRows === 1 ? "" : "s"} — {record.createCount} create, {record.updateCount} update,{" "}
            {record.moveCount} move, {record.unchangedCount} unchanged, {record.reviewCount} needs review.
          </p>

          {rows.length > 0 ? (
            <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-border [contain:paint]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th scope="col" className="px-3 py-2">Row</th>
                    <th scope="col" className="px-3 py-2">Term</th>
                    <th scope="col" className="px-3 py-2">Level</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                    <th scope="col" className="px-3 py-2">Details</th>
                    <th scope="col" className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const label = classificationLabel(row);
                    const needsDisposition = row.classification === "blocked" && !row.adminDisposition;
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.displayTerm ?? "—"}</td>
                        <td className="px-3 py-2">{row.levelNumber ?? "—"}</td>
                        <td className={`px-3 py-2 ${label.className}`}>
                          {label.text}
                          {row.changedSincePreview ? <span className="ml-2 text-xs font-medium text-state-warning">CHANGED SINCE PREVIEW</span> : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.reviewReason ?? "—"}</td>
                        <td className="px-3 py-2">
                          {needsDisposition ? (
                            <Button size="sm" variant="outline" disabled={pendingRowId === row.id} onClick={() => handleResolve(row.id)}>
                              Skip
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {rowsCursor ? (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => loadRows(rowsCursor)}>
              Load more rows
            </Button>
          ) : null}

          {record.status === "needs_review" || record.status === "ready_to_import" ? (
            <div className="flex items-center gap-3">
              {/* Gated on rowsLoaded, not just unresolvedCount === 0 — an
                  empty, not-yet-fetched rows array also computes to zero
                  unresolved, which would briefly show Confirm as enabled
                  before there's any real data behind that claim (found via
                  real-browser verification, spec 19 unit 12-13). */}
              <Button onClick={handleConfirm} disabled={confirming || !rowsLoaded || unresolvedCount > 0}>
                Confirm Import
              </Button>
              {!rowsLoaded ? (
                <p className="text-sm text-muted-foreground">Loading rows…</p>
              ) : unresolvedCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {unresolvedCount} row{unresolvedCount === 1 ? "" : "s"} still need{unresolvedCount === 1 ? "s" : ""} a decision.
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
