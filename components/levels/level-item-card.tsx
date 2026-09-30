import Link from "next/link";

import { levelItemStyle } from "./level-item-style";
import { cn } from "@/lib/utils";
import type { LevelCardItem } from "@/domains/curriculum";

type LevelItemCardProps = {
  item: LevelCardItem;
  className?: string;
};

/**
 * One curriculum card (spec 10 §12-§15): slightly taller than wide,
 * moderately compact, slightly rounded, the entire card clickable, no
 * metadata beyond the primary item and its translation/description.
 *
 * The whole card fill (not just an edge accent) carries meaning: a real SRS
 * stage color once learned, a dashed muted treatment while locked, or a
 * light accent tint for an unlearned item in the currently active lesson —
 * see `level-item-style.ts` for the shared rules behind exactly which style
 * applies.
 */
export function LevelItemCard({ item, className }: LevelItemCardProps) {
  const style = levelItemStyle(item);

  return (
    <Link
      href={`/items/${item.id}`}
      aria-label={`View ${item.primary} — ${item.secondary}`}
      className={cn(
        "flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-center transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        style.border,
        style.fill,
        className,
      )}
    >
      <span className={cn("line-clamp-2 text-base font-semibold", style.text)}>
        {item.primary}
      </span>
      <span className={cn("line-clamp-2 text-sm", style.secondaryText)}>
        {item.secondary}
      </span>
    </Link>
  );
}
