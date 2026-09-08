import Link from "next/link";

import { SrsStageBadge } from "@/components/shared/srs-stage-badge";
import type { DeckItemRow } from "@/domains/decks";
import { cn } from "@/lib/utils";

const TYPE_ACCENT: Record<DeckItemRow["itemType"], string> = {
  vocabulary: "border-l-learning-vocabulary",
  grammar: "border-l-learning-grammar",
};

const TYPE_LABEL: Record<DeckItemRow["itemType"], string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
};

type DeckItemListProps = {
  items: DeckItemRow[];
};

/**
 * The read-only deck item list (spec 14): word or grammar point,
 * translation, and current SRS stage. Each row links to the item's own
 * page, and the vocabulary/grammar distinction is carried by a visible text
 * label as well as the left border accent — never by color alone.
 */
export function DeckItemList({ items }: DeckItemListProps) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((item) => (
        <li key={item.learningItemId}>
          <Link
            href={`/items/${item.learningItemId}`}
            className={cn(
              "flex items-center gap-3 border-l-2 px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              TYPE_ACCENT[item.itemType],
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{item.primary}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.secondary} · {TYPE_LABEL[item.itemType]}
              </span>
            </span>
            <SrsStageBadge stage={item.srsStage} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
