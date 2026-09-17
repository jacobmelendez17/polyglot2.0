"use client";

import { useState, useTransition } from "react";
import { Braces } from "lucide-react";

import { getEntryRawVersionsAction } from "@/app/(admin)/admin/dictionary/raw-source-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type RawVersion = {
  id: string;
  sourceHash: string;
  createdAt: string;
  json: string;
};

/**
 * Spec 12's "View Raw Source" control — admin-only inspection of the
 * retained upstream record.
 *
 * Fetched on demand rather than shipped with the page: raw source objects
 * are large, spec 12 requires that normal page loads never parse them, and
 * they must never reach an ordinary learner. Rendered as escaped text in a
 * `<pre>`, never as markup — imported content is untrusted, and upstream
 * HTML must never be rendered.
 */
export function RawSourceDialog({
  entryId,
  lemma,
}: {
  entryId: string;
  lemma: string;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<RawVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || versions !== null) return;
    startTransition(async () => {
      const result = await getEntryRawVersionsAction({ entryId });
      if (result.ok) {
        setVersions(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Braces className="h-3.5 w-3.5" aria-hidden="true" />
          View raw source
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Raw source for {lemma}</DialogTitle>
          <DialogDescription>
            The unmodified upstream record, retained for source history and
            import debugging. Never shown to learners.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : isPending || versions === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No source versions have been retained for this entry.
          </p>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {versions.map((version) => (
              <div key={version.id}>
                <p className="mb-1 text-xs text-muted-foreground">
                  {version.createdAt} ·{" "}
                  <span className="font-mono">
                    {version.sourceHash.slice(0, 12)}
                  </span>
                </p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all text-foreground">
                  {version.json}
                </pre>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
