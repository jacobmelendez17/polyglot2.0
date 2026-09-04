import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";

const CATEGORY_BORDER: Record<LevelCardItem["itemType"], string> = {
  vocabulary: "border-l-learning-vocabulary",
  grammar: "border-l-learning-grammar",
};

type LevelItemListProps = {
  items: LevelCardItem[];
};

/**
 * List mode (spec 10 §21): a dense vertical list replacing the portrait
 * card grid. Each row stays clickable and clearly separates the primary
 * item from its translation/description — no extra columns or metadata.
 */
export function LevelItemList({ items }: LevelItemListProps) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/items/${item.id}`}
            aria-label={`View ${item.primary} — ${item.secondary}`}
            className={cn(
              "flex items-center justify-between gap-4 border-l-2 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              CATEGORY_BORDER[item.itemType],
            )}
          >
            <span className="font-medium text-foreground">{item.primary}</span>
            <span className="text-sm text-muted-foreground">{item.secondary}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
