import Link from "next/link";

import { levelItemStyle } from "./level-item-style";
import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";

type LevelItemListProps = {
  items: LevelCardItem[];
};

/**
 * List mode (spec 10 §21): a dense vertical list replacing the portrait
 * card grid. Each row stays clickable and clearly separates the primary
 * item from its translation/description — no extra columns or metadata.
 *
 * Uses the same fill/border rules as `LevelItemCard` (`level-item-style.ts`)
 * so switching view modes never changes what a stage/state looks like.
 */
export function LevelItemList({ items }: LevelItemListProps) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => {
        const style = levelItemStyle(item);
        return (
          <li key={item.id}>
            <Link
              href={`/items/${item.id}`}
              aria-label={`View ${item.primary} — ${item.secondary}`}
              className={cn(
                "flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                style.border,
                style.fill,
              )}
            >
              <span className={cn("font-medium", style.text)}>
                {item.primary}
              </span>
              <span className={cn("text-sm", style.secondaryText)}>
                {item.secondary}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
