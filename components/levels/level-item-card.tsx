import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";
import type { SrsStage } from "@/domains/srs";

/**
 * Spec 26: the card's accent now shows the viewer's SRS progress on this
 * item, not the item's content type — the section/lesson heading above
 * already carries vocabulary-vs-grammar, and `ui-context.md` requires
 * content-type and progress-state colors stay visually distinct concepts.
 * Grouped by stage name, matching the legend and `SrsStageBadge` exactly:
 * every Beginner sub-stage shares one color, both Familiar sub-stages share
 * the next.
 */
const STAGE_BORDER: Record<SrsStage, string> = {
  beginner_1: "border-t-srs-beginner",
  beginner_2: "border-t-srs-beginner",
  beginner_3: "border-t-srs-beginner",
  beginner_4: "border-t-srs-beginner",
  familiar_1: "border-t-srs-familiar",
  familiar_2: "border-t-srs-familiar",
  intermediate: "border-t-srs-intermediate",
  master: "border-t-srs-master",
  fluent: "border-t-srs-fluent",
};

/** Not yet learned — a real, common state (most of a fresh level), not an edge case. */
const NOT_LEARNED_BORDER = "border-t-border";

type LevelItemCardProps = {
  item: LevelCardItem;
  className?: string;
};

/**
 * One curriculum card (spec 10 §12-§15): slightly taller than wide,
 * moderately compact, slightly rounded, the entire card clickable, no
 * metadata beyond the primary item and its translation/description.
 */
export function LevelItemCard({ item, className }: LevelItemCardProps) {
  return (
    <Link
      href={`/items/${item.id}`}
      aria-label={`View ${item.primary} — ${item.secondary}`}
      className={cn(
        "flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-lg border-t-2 bg-card px-2 py-3 text-center ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        item.srsStage ? STAGE_BORDER[item.srsStage] : NOT_LEARNED_BORDER,
        className,
      )}
    >
      <span className="line-clamp-2 text-base font-semibold text-foreground">
        {item.primary}
      </span>
      <span className="line-clamp-2 text-sm text-muted-foreground">
        {item.secondary}
      </span>
    </Link>
  );
}
