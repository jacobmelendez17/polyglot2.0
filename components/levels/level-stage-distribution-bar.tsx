import type { LevelStageDistribution } from "@/domains/curriculum";

/**
 * One row per legend swatch, in the same order `LevelStageLegend` shows
 * them, mapped to its distribution key and a solid fill color. "Locked" and
 * "In Lessons" get more saturated fills than their card/row treatment
 * (`level-item-style.ts`'s light tints) — a thin bar segment needs real
 * contrast to read at a glance, where a whole card doesn't.
 */
const SEGMENTS: {
  key: keyof LevelStageDistribution;
  label: string;
  fillClassName: string;
}[] = [
  { key: "locked", label: "Locked", fillClassName: "bg-border" },
  { key: "inLesson", label: "In Lessons", fillClassName: "bg-primary/40" },
  { key: "beginner", label: "Beginner", fillClassName: "bg-srs-beginner" },
  { key: "familiar", label: "Familiar", fillClassName: "bg-srs-familiar" },
  { key: "intermediate", label: "Intermediate", fillClassName: "bg-srs-intermediate" },
  { key: "master", label: "Master", fillClassName: "bg-srs-master" },
  { key: "fluent", label: "Fluent", fillClassName: "bg-srs-fluent" },
];

type LevelStageDistributionBarProps = {
  distribution: LevelStageDistribution;
};

/**
 * The level-wide stage-distribution bar (spec 26 follow-up): one horizontal
 * bar, segmented by count into the same stages `LevelStageLegend` shows,
 * each segment's width proportional to how many of the level's items are in
 * that bucket. Answers "how is this level's progress distributed?" —
 * deliberately independent of `LevelProgressHeader`'s two "at Familiar 1+"
 * bars, which answer "how close is this level to unlocking the next one?"
 * Both stay, because they answer different questions from the same data.
 *
 * Segment width is genuinely per-request dynamic data (a real item count),
 * so `flexGrow` is set via inline style rather than a Tailwind class —
 * matching `components/ui/progress.tsx`'s own precedent for exactly this
 * kind of value. A segment with a zero count naturally renders at zero
 * width; nothing is padded to a minimum, so the bar never overstates a
 * bucket that is genuinely empty.
 */
export function LevelStageDistributionBar({
  distribution,
}: LevelStageDistributionBarProps) {
  const total = SEGMENTS.reduce((sum, segment) => sum + distribution[segment.key], 0);
  if (total === 0) return null;

  const summary = SEGMENTS.filter((segment) => distribution[segment.key] > 0)
    .map((segment) => `${distribution[segment.key]} ${segment.label}`)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`Level progress by stage: ${summary}, out of ${total} items`}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {SEGMENTS.map((segment) => {
        const count = distribution[segment.key];
        if (count === 0) return null;
        return (
          <div
            key={segment.key}
            aria-hidden="true"
            className={segment.fillClassName}
            style={{ flexGrow: count, flexBasis: 0 }}
          />
        );
      })}
    </div>
  );
}
