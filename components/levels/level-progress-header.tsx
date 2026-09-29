import { Progress } from "@/components/ui/progress";
import type { LevelUnlockBreakdown } from "@/domains/progress";

type LevelProgressHeaderProps = {
  levelNumber: number;
  /** Admin-authored, translated level name (`levels.name`) — omitted, never fabricated, when unset. */
  levelName: string | null;
  counts: { grammarCount: number; vocabularyCount: number; lessonCount: number };
  breakdown: LevelUnlockBreakdown;
};

function progressPercent(qualifying: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((qualifying / total) * 100));
}

/**
 * Spec 26's Level page header: identifies the level and shows its two real
 * unlock-relevant progress bars (Grammar/Vocabulary toward Familiar+),
 * replacing the plain `Level N` heading this page had before. The
 * threshold is `domains/srs`'s real `LEVEL_UNLOCK_RATIO`/
 * `LEVEL_UNLOCK_MINIMUM_STAGE` — never a hardcoded fraction.
 *
 * A bar is omitted entirely when that type has no gating items in this
 * level (e.g. a grammar-free level) — a "0/0" bar asserts a ratio that does
 * not exist rather than showing nothing.
 */
export function LevelProgressHeader({
  levelNumber,
  levelName,
  counts,
  breakdown,
}: LevelProgressHeaderProps) {
  const countParts = [
    counts.grammarCount > 0
      ? `${counts.grammarCount} grammar point${counts.grammarCount === 1 ? "" : "s"}`
      : null,
    counts.vocabularyCount > 0
      ? `${counts.vocabularyCount} word${counts.vocabularyCount === 1 ? "" : "s"}`
      : null,
    counts.lessonCount > 0
      ? `${counts.lessonCount} lesson${counts.lessonCount === 1 ? "" : "s"}`
      : null,
  ].filter((part): part is string => Boolean(part));

  const hasGrammarBar = breakdown.grammar.total > 0;
  const hasVocabularyBar = breakdown.vocabulary.total > 0;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex flex-col gap-1">
        {levelName ? (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {levelName}
          </p>
        ) : null}
        <h1 className="font-heading text-3xl font-semibold text-foreground">
          Level {levelNumber}
        </h1>
        {countParts.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {countParts.join(" · ")}
          </p>
        ) : null}
      </div>

      {hasGrammarBar || hasVocabularyBar ? (
        <div className="flex flex-col gap-3 lg:w-80 lg:shrink-0">
          <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Level progress
          </p>
          {hasGrammarBar ? (
            <ProgressStat
              label="Grammar at Familiar 1+"
              qualifying={breakdown.grammar.qualifying}
              total={breakdown.grammar.total}
            />
          ) : null}
          {hasVocabularyBar ? (
            <ProgressStat
              label="Vocabulary at Familiar 1+"
              qualifying={breakdown.vocabulary.qualifying}
              total={breakdown.vocabulary.total}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressStat({
  label,
  qualifying,
  total,
}: {
  label: string;
  qualifying: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {qualifying}/{total}
        </span>
      </div>
      <Progress value={progressPercent(qualifying, total)} />
    </div>
  );
}
