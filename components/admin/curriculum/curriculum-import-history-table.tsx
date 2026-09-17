"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  archiveCurriculumImportAction,
  permanentlyDeleteCurriculumImportAction,
  unarchiveCurriculumImportAction,
} from "@/app/(admin)/admin/curriculum/async-import-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  CurriculumImportRecord,
  CurriculumImportStatus,
} from "@/domains/admin/server";

type CurriculumImportHistoryTableProps = {
  imports: CurriculumImportRecord[];
  /** Normal history: shows an Archive action per row. */
  showArchiveAction?: boolean;
  /** Archived history: shows Restore + Permanently Delete instead. */
  archived?: boolean;
};

function statusLabel(status: CurriculumImportStatus): {
  text: string;
  className: string;
} {
  switch (status) {
    case "completed":
      return { text: "Completed", className: "text-state-success" };
    case "failed":
      return { text: "Failed", className: "text-state-error" };
    case "needs_review":
      return { text: "Needs Review", className: "text-state-warning" };
    case "ready_to_import":
      return { text: "Ready to Import", className: "text-state-warning" };
    case "uploading":
    case "queued_for_preview":
    case "previewing":
    case "queued_for_import":
    case "importing":
      return { text: "Processing", className: "text-muted-foreground" };
  }
}

function summarize(record: CurriculumImportRecord): string {
  return `${record.totalRows} row${record.totalRows === 1 ? "" : "s"} · ${record.createCount} created · ${record.updateCount} updated · ${record.moveCount} moved`;
}

/** Spec 19 §19/§25 — the same history table serves both /admin/curriculum/imports and its /archived sibling, differing only in which row action is offered. */
export function CurriculumImportHistoryTable({
  imports,
  showArchiveAction,
  archived,
}: CurriculumImportHistoryTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<CurriculumImportRecord | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleArchive(importId: string) {
    setPendingId(importId);
    setError(null);
    startTransition(async () => {
      const result = await archiveCurriculumImportAction({ importId });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleRestore(importId: string) {
    setPendingId(importId);
    setError(null);
    startTransition(async () => {
      const result = await unarchiveCurriculumImportAction({ importId });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handlePermanentDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await permanentlyDeleteCurriculumImportAction({
        importId: deleteTarget.id,
        confirmation: deleteConfirmation as "DELETE",
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDeleteTarget(null);
      setDeleteConfirmation("");
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border [contain:paint]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="px-3 py-2">
                File
              </th>
              <th scope="col" className="px-3 py-2">
                Status
              </th>
              <th scope="col" className="px-3 py-2">
                Summary
              </th>
              <th scope="col" className="px-3 py-2">
                Created
              </th>
              <th scope="col" className="px-3 py-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {imports.map((record) => {
              const status = statusLabel(record.status);
              return (
                <tr
                  key={record.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/curriculum/imports/${record.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {record.originalFilename}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 ${status.className}`}>
                    {status.text}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {summarize(record)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {showArchiveAction ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending && pendingId === record.id}
                          onClick={() => handleArchive(record.id)}
                        >
                          Archive
                        </Button>
                      ) : null}
                      {archived ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending && pendingId === record.id}
                            onClick={() => handleRestore(record.id)}
                          >
                            Restore
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-state-error"
                            onClick={() => {
                              setDeleteTarget(record);
                              setDeleteConfirmation("");
                              setError(null);
                            }}
                          >
                            Permanently Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete import?</DialogTitle>
            <DialogDescription>
              This removes the import record, stored row results, and remaining
              source file. This does not undo curriculum changes made by the
              import.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="delete-confirmation"
              className="text-sm text-muted-foreground"
            >
              Type DELETE to continue:
            </label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmation !== "DELETE" || isPending}
              onClick={handlePermanentDelete}
            >
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
