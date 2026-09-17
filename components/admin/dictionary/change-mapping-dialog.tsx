"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Search } from "lucide-react";

import {
  searchDictionaryAction,
  setDictionaryEntryAction,
} from "@/app/(admin)/admin/dictionary/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { DictionaryEntrySummary } from "@/domains/lexicon";

/**
 * Spec 12's "Change Mapping" control: dictionary search, candidate
 * comparison, and explicit manual selection.
 *
 * Choosing an entry here is what sets `manual_lock` — the mapping becomes
 * `MANUAL` and no future import can replace it. The dialog says so plainly,
 * because that consequence outlives the click.
 */
export function ChangeMappingDialog({
  vocabularyItemId,
  languageId,
  displayWord,
  currentEntryId,
}: {
  vocabularyItemId: string;
  languageId: string;
  displayWord: string;
  currentEntryId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DictionaryEntrySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function search() {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    startTransition(async () => {
      const result = await searchDictionaryAction({
        languageId,
        query: trimmed,
      });
      if (result.ok) {
        setResults(result.data);
        setError(null);
      } else {
        setResults(null);
        setError(result.error.message);
      }
    });
  }

  function choose(entryId: string) {
    startTransition(async () => {
      const result = await setDictionaryEntryAction({
        vocabularyItemId,
        dictionaryEntryId: entryId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Change mapping
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change dictionary mapping</DialogTitle>
          <DialogDescription>
            Choose the dictionary entry <strong>{displayWord}</strong> should
            use. Choosing one locks the mapping — future imports can update that
            entry&apos;s content, but will never repoint this item. Learner
            progress is not affected.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
        >
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search dictionary lemmas"
              aria-label="Search dictionary lemmas"
              className="pl-8"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isPending || query.trim().length === 0}
          >
            Search
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-state-error">
            {error}
          </p>
        ) : null}

        {results === null ? (
          <p className="text-sm text-muted-foreground">
            Search for a lemma to see candidate entries.
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No entries match that search. The word may not be imported yet.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {results.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm text-foreground">
                  {entry.lemma}
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.partOfSpeech}
                  </span>
                  {entry.sourceStatus === "missing_from_source" ? (
                    <span className="ml-1 text-xs text-state-warning">
                      — no longer in the source
                    </span>
                  ) : null}
                </span>
                {entry.id === currentEntryId ? (
                  <span className="text-xs text-muted-foreground">Current</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => choose(entry.id)}
                    disabled={isPending}
                  >
                    Use this entry
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
