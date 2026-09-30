import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LevelContentView } from "@/components/levels/level-content-view";
import { LevelProgressHeader } from "@/components/levels/level-progress-header";
import { LevelSelector } from "@/components/levels/level-selector";
import { Card, CardContent } from "@/components/ui/card";
import { buildLevelViewModel, parseLevelNumber } from "@/domains/curriculum";
import {
  getLevelByLanguageAndNumber,
  getLevelItems,
  getVocabularyGroupsByLevel,
} from "@/domains/curriculum/server";
import type { LevelUnlockBreakdown } from "@/domains/progress";
import {
  getLevelUnlockBreakdown,
  getProgressForItems,
} from "@/domains/progress/server";
import type { SrsStage } from "@/domains/srs";
import { requireUser } from "@/domains/users/server";

type LevelPageProps = {
  params: Promise<{ level: string }>;
};

const EMPTY_BREAKDOWN: LevelUnlockBreakdown = {
  grammar: { qualifying: 0, total: 0 },
  vocabulary: { qualifying: 0, total: 0 },
};

export async function generateMetadata({
  params,
}: LevelPageProps): Promise<Metadata> {
  const { level } = await params;
  const levelNumber = parseLevelNumber(level);
  return {
    title: levelNumber ? `Level ${levelNumber} — Polyglot` : "Polyglot",
  };
}

/**
 * Spec 10 §2/§5 — one dynamic route backs every level 1-50, not 50
 * hardcoded pages. Browsing here never mutates progress (§26): this page
 * only reads curriculum and progress data.
 *
 * Spec 26 added the progress panel, per-item SRS-stage coloring, and
 * per-lesson (vocabulary group) sections — all read models over data that
 * already existed; no schema change.
 */
export default async function LevelPage({ params }: LevelPageProps) {
  const { level } = await params;
  const levelNumber = parseLevelNumber(level);
  if (levelNumber === null) {
    notFound();
  }

  // proxy.ts protects /levels, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();
  const level_ = await getLevelByLanguageAndNumber(
    user.activeLanguageId,
    levelNumber,
  );
  // A valid-range level with no published `levels` row yet is "not yet
  // published" (spec 10 §29), not a 404 — only the route param's own
  // validity (checked above) is a real not-found case.
  const [items, groups] = level_
    ? await Promise.all([
        getLevelItems(level_.id),
        getVocabularyGroupsByLevel(level_.id),
      ])
    : [[], []];

  const [progressRows, breakdown] = level_
    ? await Promise.all([
        getProgressForItems(
          user.id,
          items.map((item) => item.id),
        ),
        getLevelUnlockBreakdown(user.id, level_.id),
      ])
    : [[], EMPTY_BREAKDOWN];

  const progressByItemId = new Map<string, SrsStage>(
    progressRows.map((row) => [row.learningItemId, row.srsStage]),
  );
  const { grammar, lessons, counts, stageDistribution } = buildLevelViewModel(
    items,
    groups,
    progressByItemId,
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-8 py-6 sm:px-14 lg:px-24">
      <LevelSelector currentLevel={levelNumber} />
      <Card>
        <CardContent className="flex flex-col gap-6">
          <LevelProgressHeader
            levelNumber={levelNumber}
            levelName={level_?.name ?? null}
            counts={counts}
            breakdown={breakdown}
          />
          <LevelContentView
            grammar={grammar}
            lessons={lessons}
            stageDistribution={stageDistribution}
          />
        </CardContent>
      </Card>
    </div>
  );
}
