"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MAX_IMPORT_FILE_BYTES } from "@/domains/curriculum";

import { createAsyncCurriculumImportAction } from "@/app/(admin)/admin/curriculum/async-import-actions";

type CreateAsyncImportFormProps = {
  languageId: string;
};

function extensionForFile(fileName: string): "csv" | "tsv" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".tsv")) return "tsv";
  return null;
}

/**
 * Upload step of the asynchronous import flow (spec 19 §6, §39's
 * "Uploading curriculum..." state). The file's bytes go straight from the
 * browser to S3 via the presigned URL — this component never reads the
 * file's contents and never sends them through a Server Action.
 */
export function CreateAsyncImportForm({ languageId }: CreateAsyncImportFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading">("idle");

  function handleFileSelected(file: File) {
    const fileExtension = extensionForFile(file.name);
    if (!fileExtension) {
      setError("Choose a .csv or .tsv file.");
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(`That file is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB).`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createAsyncCurriculumImportAction({ languageId, originalFilename: file.name, fileExtension });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setPhase("uploading");
      try {
        const uploadResponse = await fetch(result.data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": fileExtension === "csv" ? "text/csv" : "text/tab-separated-values" },
          body: file,
        });
        if (!uploadResponse.ok) {
          setError("The upload failed. Please try again.");
          setPhase("idle");
          return;
        }
      } catch {
        setError("The upload failed. Please check your connection and try again.");
        setPhase("idle");
        return;
      }

      router.push(`/admin/curriculum/imports/${result.data.importId}`);
    });
  }

  const busy = isPending || phase === "uploading";

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <input
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
        className="rounded-md border border-dashed border-border px-3 py-6 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm disabled:opacity-50"
      />
      {busy ? <p className="text-sm text-muted-foreground">{phase === "uploading" ? "Uploading…" : "Starting import…"}</p> : null}

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
