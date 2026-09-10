import { SrsStageBadge } from "@/components/shared/srs-stage-badge";
import { EMPTY_FIELD } from "@/domains/curriculum";
import type { ItemProgress } from "@/domains/progress";
import { formatAbsoluteDate, formatAbsoluteDateTime } from "@/lib/time/format-absolute-date";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

type ProgressSectionProps = {
  progress: ItemProgress | null;
  /** When the learner unlocked this item's level — the item's own unlock moment. */
  levelUnlockedAt: Date | null;
  /** The learner's IANA timezone, so dates read the same on every device. */
  timeZone: string;
  /** Authoritative server time, passed in rather than read here — display formatting must not depend on the browser clock. */
  now: Date;
};

/**
 * Spec 18's `Your Progress`. Item-page only: a lesson never renders it,
 * because the learner has no progress on an item they are being taught for
 * the first time.
 *
 * `First Studied` is deliberately absent (spec 18 says not to show it) even
 * though `user_item_progress.learned_at` holds it.
 */
export function ProgressSection({ progress, levelUnlockedAt, timeZone, now }: ProgressSectionProps) {
  const unlockDate = levelUnlockedAt ? formatAbsoluteDate(levelUnlockedAt, timeZone) : EMPTY_FIELD;

  if (!progress) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-base text-muted-foreground">
          Not yet studied — your progress appears here once you learn this item in a lesson.
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Current Stage">
            <SrsStageBadge stage={null} />
          </Metric>
          <Metric label="Unlock Date">{unlockDate}</Metric>
        </dl>
        <SrsVisualizationSlot />
      </div>
    );
  }

  const accuracy = progress.reviewCount === 0 ? EMPTY_FIELD : `${Math.round((progress.correctCount / progress.reviewCount) * 100)}%`;
  // Relative for the "when do I see this again?" question, absolute so the
  // learner can also plan around it. A Fluent item has no next review at all,
  // which is a completed cycle rather than missing data.
  const nextReview = progress.nextReviewAt
    ? `${formatRelativeTime(progress.nextReviewAt, now)} · ${formatAbsoluteDateTime(progress.nextReviewAt, timeZone)}`
    : progress.srsStage === "fluent"
      ? "Review cycle complete"
      : EMPTY_FIELD;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Metric label="Current Stage">
          <SrsStageBadge stage={progress.srsStage} />
        </Metric>
        <Metric label="Next Review">{nextReview}</Metric>
        <Metric label="Unlock Date">{unlockDate}</Metric>
        <Metric label="Accuracy">{accuracy}</Metric>
        <Metric label="Times Studied">{String(progress.reviewCount)}</Metric>
        <Metric label="Retired Date">{progress.fluentAt ? formatAbsoluteDate(progress.fluentAt, timeZone) : EMPTY_FIELD}</Metric>
        {/*
          Leech has no rule anywhere in the product yet — no threshold, no
          formula, no stored flag (see progress-tracker.md's Open Questions).
          An em dash says "not computed"; printing "No" would assert
          something nobody has calculated, which is worse than admitting the
          gap. The row stays so the metric's place is settled when the rule
          arrives.
        */}
        <Metric label="Leech">{EMPTY_FIELD}</Metric>
      </dl>

      <SrsVisualizationSlot />
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * The reserved area for the future animated SRS-stage visualization (spec
 * 18 explicitly defers building it). Kept as its own component so replacing
 * it later is a one-file change that does not restructure this section.
 */
function SrsVisualizationSlot() {
  return (
    <div
      aria-hidden="true"
      className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6"
    >
      <p className="text-sm text-muted-foreground">Stage visualization coming soon</p>
    </div>
  );
}
