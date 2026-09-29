import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";
import type { SrsStage } from "@/domains/srs";

/** Matches `LevelItemCard`'s stage coloring — see its docstring for why this replaced a content-type accent. */
const STAGE_BORDER: Record<SrsStage, string> = {
  beginner_1: "border-l-srs-beginner",
  beginner_2: "border-l-srs-beginner",
  beginner_3: "border-l-srs-beginner",
  beginner_4: "border-l-srs-beginner",
  familiar_1: "border-l-srs-familiar",
  familiar_2: "border-l-srs-familiar",
  intermediate: "border-l-srs-intermediate",
  master: "border-l-srs-master",
  fluent: "border-l-srs-fluent",
};
const NOT_LEARNED_BORDER = "border-l-border";

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
              item.srsStage ? STAGE_BORDER[item.srsStage] : NOT_LEARNED_BORDER,
            )}
          >
            <span className="font-medium text-foreground">{item.primary}</span>
            <span className="text-sm text-muted-foreground">
              {item.secondary}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
