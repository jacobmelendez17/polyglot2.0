import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";
import type { SrsStage } from "@/domains/srs";

/** Matches `LevelItemCard`'s stage dot — same stage-name grouping as the legend/`SrsStageBadge`. */
const STAGE_DOT: Record<SrsStage, string> = {
  beginner_1: "bg-srs-beginner",
  beginner_2: "bg-srs-beginner",
  beginner_3: "bg-srs-beginner",
  beginner_4: "bg-srs-beginner",
  familiar_1: "bg-srs-familiar",
  familiar_2: "bg-srs-familiar",
  intermediate: "bg-srs-intermediate",
  master: "bg-srs-master",
  fluent: "bg-srs-fluent",
};

/** `ui-context.md`'s fixed content-type invariant — matches `LevelItemCard`'s left border. */
const TYPE_BORDER: Record<LevelCardItem["itemType"], string> = {
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
 *
 * Two independent accents, same split as `LevelItemCard`: the row's left
 * border is the fixed content-type color; a small leading dot carries SRS
 * stage — filled with the stage color once learned, a dashed outline when
 * nothing has been recorded yet, so "not learned" reads as its own visual
 * state rather than a paler version of a real stage.
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
              "flex items-center gap-3 border-l-2 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              TYPE_BORDER[item.itemType],
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                item.srsStage
                  ? STAGE_DOT[item.srsStage]
                  : "border border-dashed border-border",
              )}
            />
            <span className="flex-1 font-medium text-foreground">
              {item.primary}
            </span>
            <span className="text-sm text-muted-foreground">
              {item.secondary}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
