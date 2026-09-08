import { SRS_STAGE_LABELS } from "@/domains/srs";
import type { SrsStage } from "@/domains/srs";
import { cn } from "@/lib/utils";

/**
 * The learner-facing SRS stage chip. ui-context.md groups stage color by
 * stage *name* rather than sub-stage — every Beginner shares one green,
 * both Familiar stages share the next — and the sub-stage number is carried
 * by the label text. The label is always rendered, so stage is never
 * communicated by color alone.
 *
 * `null` is a real state (an item that is in a deck but has no progress
 * record), not an error, and reads as "Not started".
 */
const STAGE_CLASSES: Record<SrsStage, string> = {
  beginner_1: "bg-srs-beginner text-foreground",
  beginner_2: "bg-srs-beginner text-foreground",
  beginner_3: "bg-srs-beginner text-foreground",
  beginner_4: "bg-srs-beginner text-foreground",
  familiar_1: "bg-srs-familiar text-foreground",
  familiar_2: "bg-srs-familiar text-foreground",
  intermediate: "bg-srs-intermediate text-foreground",
  master: "bg-srs-master text-background",
  fluent: "bg-srs-fluent text-background",
};

type SrsStageBadgeProps = {
  stage: SrsStage | null;
  className?: string;
};

export function SrsStageBadge({ stage, className }: SrsStageBadgeProps) {
  const label = stage === null ? "Not started" : SRS_STAGE_LABELS[stage];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium",
        stage === null ? "bg-muted text-muted-foreground" : STAGE_CLASSES[stage],
        className,
      )}
    >
      {label}
    </span>
  );
}
