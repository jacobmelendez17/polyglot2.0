import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";
import type { SrsStage } from "@/domains/srs";

/**
 * The top border shows the viewer's SRS progress on this item — grouped by
 * stage name, matching the legend and `SrsStageBadge` exactly (every
 * Beginner sub-stage shares one color, both Familiar sub-stages share the
 * next).
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

/** Not yet learned — a real, common state (most of a fresh level), not an edge case. Dashed rather than solid, so "nothing recorded" reads as visually distinct from every real stage, not just a paler color. */
const NOT_LEARNED_BORDER = "border-t-border [border-top-style:dashed]";

/** `ui-context.md`'s fixed content-type invariant ("vocabulary uses blue and grammar uses red") — kept on a different edge than the stage color so the two never compete for the same accent. */
const TYPE_BORDER: Record<LevelCardItem["itemType"], string> = {
  vocabulary: "border-l-learning-vocabulary",
  grammar: "border-l-learning-grammar",
};

type LevelItemCardProps = {
  item: LevelCardItem;
  className?: string;
};

/**
 * One curriculum card (spec 10 §12-§15): slightly taller than wide,
 * moderately compact, slightly rounded, the entire card clickable, no
 * metadata beyond the primary item and its translation/description.
 *
 * Two independent accents, on two different edges, so content type and
 * progress state never blend into one color (`ui-context.md`'s "these must
 * remain visually distinct concepts"): the left border is the item's fixed
 * content-type color; the top border is the viewer's real SRS stage,
 * dashed when nothing has been recorded yet.
 */
export function LevelItemCard({ item, className }: LevelItemCardProps) {
  return (
    <Link
      href={`/items/${item.id}`}
      aria-label={`View ${item.primary} — ${item.secondary}`}
      className={cn(
        "flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-lg border-t-2 border-l-2 bg-card px-2 py-3 text-center ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        TYPE_BORDER[item.itemType],
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
