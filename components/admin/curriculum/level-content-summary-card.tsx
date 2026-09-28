import type { AdminLevelContentSummary } from "@/domains/curriculum";

type LevelContentSummaryCardProps = {
  levelNumber: number;
  summary: AdminLevelContentSummary;
};

/**
 * Spec 25 §15's per-level editorial summary, e.g. "60 items, 58
 * metadata-complete, 24 need definitions, 31 need examples." Deliberately
 * omits the spec's "warnings"/"blocking conflicts" pair — neither has a
 * backing data source yet (see `AdminCurriculumNeedsFilter`'s own
 * docstring). Read-only: this is a summary, not a control — the `Needs`
 * filter above it is what actually navigates to any of these items.
 */
export function LevelContentSummaryCard({
  levelNumber,
  summary,
}: LevelContentSummaryCardProps) {
  const stats: { label: string; value: number }[] = [
    { label: "items", value: summary.totalItems },
    { label: "metadata-complete", value: summary.metadataCompleteCount },
    { label: "need definitions", value: summary.needsDefinitionCount },
    { label: "need examples", value: summary.needsExamplesCount },
    { label: "need IPA", value: summary.needsIpaCount },
    { label: "need pronunciation", value: summary.needsPronunciationCount },
    { label: "need synonyms", value: summary.needsSynonymsCount },
    { label: "need variations", value: summary.needsVariationsCount },
    { label: "have draft changes", value: summary.draftChangesCount },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">Level {levelNumber}</p>
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-baseline gap-1.5">
            <dt className="sr-only">{stat.label}</dt>
            <dd className="text-sm font-semibold text-foreground">
              {stat.value}
            </dd>
            <span className="text-sm text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </dl>
    </div>
  );
}
