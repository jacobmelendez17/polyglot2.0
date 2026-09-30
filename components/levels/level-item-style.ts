import type { LevelCardItem } from "@/domains/curriculum";
import type { SrsStage } from "@/domains/srs";

export type LevelItemStyle = {
  border: string;
  fill: string;
  text: string;
  secondaryText: string;
};

/**
 * A learned item's whole background is its real SRS stage color — grouped
 * by stage name, matching the legend and `SrsStageBadge` exactly (every
 * Beginner sub-stage shares one color, both Familiar sub-stages share the
 * next). Text color follows `SrsStageBadge`'s own contrast rule: light
 * enough stages keep dark text, Master/Fluent's darker greens switch to
 * light text. Border stays neutral so the fill — the real signal — isn't
 * competing with a second accent.
 */
const LEARNED_STYLE: Record<SrsStage, LevelItemStyle> = {
  beginner_1: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-beginner",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  beginner_2: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-beginner",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  beginner_3: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-beginner",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  beginner_4: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-beginner",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  familiar_1: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-familiar",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  familiar_2: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-familiar",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  intermediate: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-intermediate",
    text: "text-foreground",
    secondaryText: "text-foreground/70",
  },
  master: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-master",
    text: "text-background",
    secondaryText: "text-background/75",
  },
  fluent: {
    border: "border-2 border-solid border-transparent",
    fill: "bg-srs-fluent",
    text: "text-background",
    secondaryText: "text-background/75",
  },
};

/**
 * The two not-yet-learned states (spec 26 follow-up): `locked` is dashed and
 * muted, `inLesson` is a light, inviting accent tint. See `level-view.ts`'s
 * `LevelItemDisplayState` docstring for exactly what these do and do not
 * claim about real access.
 */
const NOT_LEARNED_STYLE: Record<"locked" | "inLesson", LevelItemStyle> = {
  locked: {
    border: "border-2 border-dashed border-border",
    fill: "bg-muted/40",
    text: "text-muted-foreground",
    secondaryText: "text-muted-foreground/70",
  },
  inLesson: {
    border: "border-2 border-solid border-primary/50",
    fill: "bg-primary/10",
    text: "text-foreground",
    secondaryText: "text-muted-foreground",
  },
};

/** Shared by `LevelItemCard` and `LevelItemList` so the two view modes never drift apart on what a stage/state looks like. */
export function levelItemStyle(item: LevelCardItem): LevelItemStyle {
  if (item.srsStage) return LEARNED_STYLE[item.srsStage];
  return NOT_LEARNED_STYLE[item.displayState === "inLesson" ? "inLesson" : "locked"];
}
