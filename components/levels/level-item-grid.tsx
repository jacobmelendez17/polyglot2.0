import { cn } from "@/lib/utils";
import { LevelItemCard } from "@/components/levels/level-item-card";
import type { LevelCardItem } from "@/domains/curriculum";

export type LevelGridDensity = "large" | "normal" | "compact";

/**
 * Desktop-target column counts per density (spec 10 §18-§20: 8/row default,
 * ~6/row large, ~10/row compact), stepping down through smaller breakpoints
 * rather than forcing the desktop count on tablet/mobile (spec 10 §23).
 */
const DENSITY_GRID_CLASSES: Record<LevelGridDensity, string> = {
  large: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
  normal: "grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8",
  compact: "grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10",
};

type LevelItemGridProps = {
  items: LevelCardItem[];
  density?: LevelGridDensity;
};

export function LevelItemGrid({ items, density = "normal" }: LevelItemGridProps) {
  return (
    <div className={cn("grid gap-3", DENSITY_GRID_CLASSES[density])}>
      {items.map((item) => (
        <LevelItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
