"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IMPORT_COLUMNS, MAX_IMPORT_FILE_BYTES } from "@/domains/curriculum";

import { bulkImportVocabularyAction, previewVocabularyImportAction } from "@/app/(admin)/admin/curriculum/import-actions";
import type { BulkImportSummary, ImportPreviewResult } from "@/app/(admin)/admin/curriculum/import-actions";
import type { ImportRowPreview } from "@/domains/admin/server";

type ImportVocabularyDialogProps = {
  languageId: string;
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; levelId: string; name: string }[];
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
 * Spec 13's "Curriculum Authoring at Volume" — upload, preview, resolve
 * duplicates, and commit a bulk vocabulary CSV/TSV import, then run Lexicon
 * matching over exactly what was created. Level and group are chosen here,
 * not read from the file (spec 13: "Level, group... remain controlled by
 * Admin"); imported rows land Pending, same as any other new item, and stay
 * that way until published separately.
 */
export function ImportVocabularyDialog({ languageId, levels, groups }: ImportVocabularyDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>({ phase: "setup" });
  const [levelId, setLevelId] = useState("");
  const [vocabularyGroupId, setVocabularyGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<number, RowDecision>>(new Map());

  const groupsForLevel = groups.filter((group) => group.levelId === levelId);

  function reset() {
    setStep({ phase: "setup" });
    setLevelId("");
    setVocabularyGroupId("");
    setError(null);
    setDecisions(new Map());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleFileSelected(file: File) {
    if (!levelId || !vocabularyGroupId) {
      setError("Choose a level and group first.");
      return;
    }
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
      const result = await bulkImportVocabularyAction({
        languageId,
        levelId,
        vocabularyGroupId,
        idempotencyKey: crypto.randomUUID(),
        rows,
      });
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
          <DialogTitle>Import vocabulary</DialogTitle>
          <DialogDescription>
            Upload a CSV or TSV file. Required columns: {IMPORT_COLUMNS.slice(0, 3).join(", ")}. Optional: {IMPORT_COLUMNS.slice(3).join(", ")}.
            Every row lands as Pending — nothing is published automatically.
          </DialogDescription>
        </DialogHeader>

        {step.phase === "setup" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={levelId}
                onValueChange={(value) => {
                  setLevelId(value);
                  setVocabularyGroupId("");
                }}
              >
                <SelectTrigger aria-label="Target level">
                  <SelectValue placeholder="Choose a level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      Level {level.levelNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={vocabularyGroupId} onValueChange={setVocabularyGroupId} disabled={!levelId}>
                <SelectTrigger aria-label="Target group">
                  <SelectValue placeholder={levelId ? "Choose a group" : "Choose a level first"} />
                </SelectTrigger>
                <SelectContent>
                  {groupsForLevel.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              disabled={!levelId || !vocabularyGroupId || isPending}
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
                    <th scope="col" className="px-3 py-2">Term</th>
                    <th scope="col" className="px-3 py-2">Meaning</th>
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
                        <td className="px-3 py-2">{row.fields?.term ?? row.raw.term ?? "—"}</td>
                        <td className="px-3 py-2">{row.fields?.primaryMeaning ?? row.raw.primary_meaning ?? "—"}</td>
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
