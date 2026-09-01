import { cn } from "@/lib/utils";
import type { ItemSegmentState, LearningItemType } from "@/domains/lessons";

export type ProgressSegmentItem = {
  itemId: string;
  itemType: LearningItemType;
  state: ItemSegmentState;
  /** Human-readable state for the accessible label, e.g. "viewed", "current", "partially satisfied". */
  stateLabel: string;
};

type LessonProgressSegmentsProps = {
  items: ProgressSegmentItem[];
  /** Present only during study, where segments double as the item selector (spec 07 §17). */
  onSelect?: (itemId: string) => void;
};

const CATEGORY_ACCENT: Record<LearningItemType, string> = {
  vocabulary: "border-learning-vocabulary bg-learning-vocabulary/20",
  grammar: "border-learning-grammar bg-learning-grammar/20",
};

/**
 * Shared between study (§17) and quiz (§39). States are distinguished by
 * shape as well as color so progress remains understandable without color
 * alone: current is a tall solid bar with a category-accent border,
 * complete is a solid neutral bar, partial is a dashed half-filled bar, and
 * not-started is a thin outlined bar.
 */
export function LessonProgressSegments({ items, onSelect }: LessonProgressSegmentsProps) {
  return (
    <div className="flex items-end justify-center gap-1.5 sm:gap-2" role={onSelect ? "group" : undefined}>
      {items.map((item, index) => {
        const accessibleLabel = `${item.itemType === "vocabulary" ? "Vocabulary" : "Grammar"} item ${index + 1} of ${items.length}, ${item.stateLabel}`;

        const shapeClass = cn(
          "w-6 rounded-full transition-all sm:w-8",
          item.state === "current" && cn("h-3 border-2", CATEGORY_ACCENT[item.itemType]),
          item.state === "complete" && "h-1.5 bg-foreground/70",
          item.state === "partial" && "h-1.5 border border-dashed border-foreground/60 bg-foreground/25",
          item.state === "not-started" && "h-1.5 border border-dashed border-border bg-transparent",
        );

        if (onSelect) {
          return (
            <button
              key={item.itemId}
              type="button"
              aria-label={accessibleLabel}
              aria-current={item.state === "current" ? "true" : undefined}
              onClick={() => onSelect(item.itemId)}
              className={cn(shapeClass, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background")}
            />
          );
        }

        return (
          <div
            key={item.itemId}
            role="img"
            aria-label={accessibleLabel}
            className={shapeClass}
          />
        );
      })}
    </div>
  );
}
