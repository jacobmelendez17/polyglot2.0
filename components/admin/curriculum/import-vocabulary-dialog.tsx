"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GRAMMAR_GROUP_NUMBER, IMPORT_COLUMNS, MAX_IMPORT_FILE_BYTES, MAX_VOCABULARY_GROUP_NUMBER } from "@/domains/curriculum";

import { bulkImportVocabularyAction, previewVocabularyImportAction } from "@/app/(admin)/admin/curriculum/import-actions";
import type { BulkImportSummary, ImportPreviewResult } from "@/app/(admin)/admin/curriculum/import-actions";
import type { ImportRowPreview } from "@/domains/admin/server";

type ImportVocabularyDialogProps = {
  languageId: string;
};

type RowDecision = "import" | "skip";
type Step = { phase: "setup" } | { phase: "preview"; rows: ImportRowPreview[] } | { phase: "done"; summary: BulkImportSummary };

function delimiterForFile(fileName: string): "," | "\t" {
  return fileName.toLowerCase().endsWith(".tsv") ? "\t" : ",";
}

function rowKey(row: ImportRowPreview): number {
  return row.rowNumber;
}

/**
 * Bulk curriculum CSV/TSV import — upload, preview, resolve duplicates, and
 * commit, then run Lexicon matching over exactly the vocabulary items that
 * were created. Level and group are read from the file itself, one pair
 * per row (2026-09-08 rewrite — previously chosen once for the whole file
 * via a picker here); imported rows land Pending, same as any other new
 * item, and stay that way until published separately.
 */
export function ImportVocabularyDialog({ languageId }: ImportVocabularyDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>({ phase: "setup" });
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<number, RowDecision>>(new Map());

  function reset() {
    setStep({ phase: "setup" });
    setError(null);
    setDecisions(new Map());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleFileSelected(file: File) {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(`That file is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const fileContent = await file.text();
      const result = await previewVocabularyImportAction({ languageId, fileContent, delimiter: delimiterForFile(file.name) });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      const preview: ImportPreviewResult = result.data;
      if (preview.fileError) {
        setError(preview.fileError.message);
        return;
      }
      const initialDecisions = new Map<number, RowDecision>();
      for (const row of preview.rows) {
        if (!row.fields) continue;
        const isFlagged = row.existingDuplicates.length > 0 || row.duplicateOfEarlierRow !== null;
        initialDecisions.set(rowKey(row), isFlagged ? "skip" : "import");
      }
      setDecisions(initialDecisions);
      setStep({ phase: "preview", rows: preview.rows });
    });
  }

  function handleConfirm() {
    if (step.phase !== "preview") return;
    const rows = step.rows
      .filter((row) => row.fields && decisions.get(rowKey(row)) === "import")
      .map((row) => ({ fields: row.fields!, decision: "import" as const }));

    if (rows.length === 0) {
      setError("Nothing is selected to import.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await bulkImportVocabularyAction({ languageId, idempotencyKey: crypto.randomUUID(), rows });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStep({ phase: "done", summary: result.data });
      router.refresh();
    });
  }

  const importCount = step.phase === "preview" ? [...decisions.values()].filter((d) => d === "import").length : 0;
  const blockedCount = step.phase === "preview" ? step.rows.filter((row) => !row.fields).length : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import vocabulary
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import curriculum</DialogTitle>
          <DialogDescription>
            Upload a CSV or TSV file. Required columns: {IMPORT_COLUMNS.slice(0, 4).join(", ")}. Optional: {IMPORT_COLUMNS.slice(4).join(", ")}.
            {" "}Group is that word&apos;s vocabulary group number within its level (1-{MAX_VOCABULARY_GROUP_NUMBER}) — use {GRAMMAR_GROUP_NUMBER} for a
            grammar row instead (word/translation become its structure/meaning; write the explanation afterward in Admin). Every row lands as
            Pending — nothing is published automatically.
          </DialogDescription>
        </DialogHeader>

        {step.phase === "setup" ? (
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              disabled={isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
              className="rounded-md border border-dashed border-border px-3 py-6 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm disabled:opacity-50"
            />
            {isPending ? <p className="text-sm text-muted-foreground">Reading file…</p> : null}
          </div>
        ) : null}

        {step.phase === "preview" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {step.rows.length} row{step.rows.length === 1 ? "" : "s"} parsed — {importCount} selected to import
              {blockedCount > 0 ? `, ${blockedCount} cannot be imported until fixed in the file` : ""}.
            </p>
            <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-border [contain:paint]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                    <th scope="col" className="px-3 py-2">Row</th>
                    <th scope="col" className="px-3 py-2">Word</th>
                    <th scope="col" className="px-3 py-2">Meaning</th>
                    <th scope="col" className="px-3 py-2">Level</th>
                    <th scope="col" className="px-3 py-2">Group</th>
                    <th scope="col" className="px-3 py-2">Status</th>
                    <th scope="col" className="px-3 py-2">Import?</th>
                  </tr>
                </thead>
                <tbody>
                  {step.rows.map((row) => {
                    const key = rowKey(row);
                    const isDuplicate = row.existingDuplicates.length > 0 || row.duplicateOfEarlierRow !== null;
                    return (
                      <tr key={key} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.raw.word ?? "—"}</td>
                        <td className="px-3 py-2">{row.raw.translation ?? "—"}</td>
                        <td className="px-3 py-2">{row.raw.level ?? "—"}</td>
                        <td className="px-3 py-2">{row.fields?.itemType === "grammar" ? `${row.raw.group} (Grammar)` : (row.raw.group ?? "—")}</td>
                        <td className="px-3 py-2">
                          {!row.fields ? (
                            <span className="text-state-error">{row.fieldIssues.map((issue) => issue.message).join(" ")}</span>
                          ) : row.existingDuplicates.length > 0 ? (
                            <span className="text-state-warning">Matches existing: {row.existingDuplicates[0]!.displayLabel}</span>
                          ) : row.duplicateOfEarlierRow !== null ? (
                            <span className="text-state-warning">Duplicates row {row.duplicateOfEarlierRow}</span>
                          ) : (
                            <span className="text-state-success">Ready</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.fields ? (
                            <Checkbox
                              checked={decisions.get(key) === "import"}
                              onCheckedChange={(checked) =>
                                setDecisions((prev) => {
                                  const next = new Map(prev);
                                  next.set(key, checked ? "import" : "skip");
                                  return next;
                                })
                              }
                              aria-label={`Import row ${row.rowNumber}`}
                            />
                          ) : null}
                          {isDuplicate && row.fields ? <span className="ml-1 text-xs text-muted-foreground">(as homonym)</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {step.phase === "done" ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium text-foreground">
              Created {step.summary.createdCount} item{step.summary.createdCount === 1 ? "" : "s"}, Pending.
            </p>
            <p className="text-muted-foreground">
              {Object.entries(step.summary.matched)
                .map(([status, count]) => `${count} ${status.replaceAll("_", " ")}`)
                .join(", ") || "No dictionary matching ran."}
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {step.phase === "preview" ? (
            <Button variant="outline" onClick={reset}>
              Start over
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>
              {step.phase === "done" ? "Close" : "Cancel"}
            </Button>
          )}
          {step.phase === "preview" ? (
            <Button onClick={handleConfirm} disabled={isPending || importCount === 0}>
              Import {importCount} item{importCount === 1 ? "" : "s"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
