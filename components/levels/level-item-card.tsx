import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";

const CATEGORY_BORDER: Record<LevelCardItem["itemType"], string> = {
  vocabulary: "border-t-learning-vocabulary",
  grammar: "border-t-learning-grammar",
};

type LevelItemCardProps = {
  item: LevelCardItem;
  className?: string;
};

/**
 * One curriculum card (spec 10 §12-§15): slightly taller than wide,
 * moderately compact, slightly rounded, the entire card clickable, no
 * metadata beyond the primary item and its translation/description. The
 * grammar/vocabulary distinction is a subtle top-border accent only — the
 * section headings above already carry the primary, non-color context
 * (spec 10 §15's own framing), so a color-only accent here is acceptable.
 */
export function LevelItemCard({ item, className }: LevelItemCardProps) {
  return (
    <Link
      href={`/items/${item.id}`}
      aria-label={`View ${item.primary} — ${item.secondary}`}
      className={cn(
        "flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-lg border-t-2 bg-card px-2 py-3 text-center ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        CATEGORY_BORDER[item.itemType],
        className,
      )}
    >
      <span className="line-clamp-2 text-base font-semibold text-foreground">{item.primary}</span>
      <span className="line-clamp-2 text-sm text-muted-foreground">{item.secondary}</span>
    </Link>
  );
}
