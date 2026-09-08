"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Search } from "lucide-react";

import { SrsStageBadge } from "@/components/shared/srs-stage-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DECK_ITEM_PICKER_LIMIT } from "@/domains/decks";
import type { DeckPickerItem } from "@/domains/decks";

export type DeckItemSearch = (
  query: string,
) => Promise<{ ok: true; data: DeckPickerItem[] } | { ok: false; error: { code: string; message: string } }>;

type DeckItemPickerProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Server-side search — the caller supplies the action, so one picker serves both the learner and Admin flows. */
  search: DeckItemSearch;
  /** Items already in the deck; shown as checked-and-disabled rather than hidden, so the list stays predictable. */
  alreadyInDeckIds?: string[];
  emptyMessage: string;
};

/**
 * The searchable item picker behind "create deck" and "add items" (spec 14).
 * Candidate items are always fetched from the server: for a learner they are
 * exactly the items they have already learned, so an ineligible item is
 * never offered — and the mutation re-checks eligibility regardless, because
 * hiding an option is not authorization.
 */
export function DeckItemPicker({ selectedIds, onChange, search, alreadyInDeckIds = [], emptyMessage }: DeckItemPickerProps) {
  const searchInputId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DeckPickerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const alreadyInDeck = new Set(alreadyInDeckIds);

  function runSearch(nextQuery: string) {
    startTransition(async () => {
      const result = await search(nextQuery);
      setHasLoaded(true);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setError(null);
      setItems(result.data);
    });
  }

  useEffect(() => {
    runSearch("");
    // Deliberately runs once, on mount: `search` is a Server Action
    // reference and re-running on its identity would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(learningItemId: string, checked: boolean) {
    onChange(checked ? [...selectedIds, learningItemId] : selectedIds.filter((id) => id !== learningItemId));
  }

  return (
    <div className="space-y-3">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(query);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={searchInputId}
          type="search"
          className="pl-8"
          placeholder="Search your items..."
          aria-label="Search items to add"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      {error ? (
        <p role="alert" className="text-sm text-state-error">
          {error}
        </p>
      ) : null}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        {!hasLoaded ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading items…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const isAlreadyInDeck = alreadyInDeck.has(item.learningItemId);
              return (
                <li key={item.learningItemId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted has-disabled:cursor-default has-disabled:opacity-60">
                    <Checkbox
                      checked={isAlreadyInDeck || selectedIds.includes(item.learningItemId)}
                      disabled={isAlreadyInDeck || isPending}
                      onCheckedChange={(checked) => toggle(item.learningItemId, checked === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{item.primary}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.secondary} · Level {item.levelNumber}
                      </span>
                    </span>
                    {item.srsStage !== null ? <SrsStageBadge stage={item.srsStage} /> : null}
                    {isAlreadyInDeck ? <span className="shrink-0 text-xs text-muted-foreground">In deck</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground" role="status">
        {selectedIds.length} selected
        {items.length === DECK_ITEM_PICKER_LIMIT ? " · showing the first 100 matches — search to narrow them" : ""}
      </p>
    </div>
  );
}
