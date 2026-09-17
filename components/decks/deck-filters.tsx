"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DECK_CONTENT_FILTERS } from "@/domains/decks";
import type { DeckContentFilter } from "@/domains/decks";

type DeckFiltersProps = {
  search: string;
  contentFilter: DeckContentFilter;
};

/**
 * Search and the Vocabulary / Grammar / Both type filter (spec 14). Both
 * live in the URL rather than component state (code-standards.md's "use URL
 * or search parameters for navigable/shareable state"), so a filtered view
 * is bookmarkable and survives a refresh — and the server, which already has
 * the decks, does the filtering.
 *
 * The search box submits on Enter rather than on every keystroke, so typing
 * does not fire a navigation per character.
 */
export function DeckFilters({ search, contentFilter }: DeckFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchDraft, setSearchDraft] = useState(search);

  function navigate(next: {
    search: string;
    contentFilter: DeckContentFilter;
  }) {
    const params = new URLSearchParams();
    if (next.search.trim()) params.set("q", next.search.trim());
    if (next.contentFilter !== "all") params.set("type", next.contentFilter);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <form
        className="relative sm:max-w-xs sm:flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ search: searchDraft, contentFilter });
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search decks..."
          aria-label="Search decks"
          className="pl-8"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
        />
      </form>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={contentFilter}
        onValueChange={(next) => {
          if (next)
            navigate({
              search: searchDraft,
              contentFilter: next as DeckContentFilter,
            });
        }}
        aria-label="Filter decks by content type"
      >
        {DECK_CONTENT_FILTERS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
