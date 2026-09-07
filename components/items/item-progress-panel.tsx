import { SRS_STAGE_LABELS } from "@/domains/srs";
import type { ItemProgress } from "@/domains/progress";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

type ItemProgressPanelProps = {
  progress: ItemProgress | null;
};

/**
 * Spec 13's "learner SRS stage and progress information" bullet. `progress`
 * is `null` for an item the learner has never enrolled (not an error state
 * — most items on a fresh account are like this).
 */
export function ItemProgressPanel({ progress }: ItemProgressPanelProps) {
  if (!progress) {
    return <p className="text-sm text-muted-foreground">Not yet studied — this appears here once you learn it in a lesson.</p>;
  }

  const now = new Date();
  const accuracy = progress.reviewCount === 0 ? null : Math.round((progress.correctCount / progress.reviewCount) * 100);
  const nextReviewLabel = progress.nextReviewAt
    ? formatRelativeTime(progress.nextReviewAt, now)
    : progress.srsStage === "fluent"
      ? "Mastered"
      : "—";

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Stage</dt>
        <dd className="mt-0.5 text-sm font-semibold text-foreground">{SRS_STAGE_LABELS[progress.srsStage]}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Reviews</dt>
        <dd className="mt-0.5 text-sm font-semibold text-foreground">{progress.reviewCount}</dd>
      </div>
      {accuracy !== null ? (
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Accuracy</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{accuracy}%</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Next review</dt>
        <dd className="mt-0.5 text-sm font-semibold text-foreground">{nextReviewLabel}</dd>
      </div>
    </dl>
  );
}
