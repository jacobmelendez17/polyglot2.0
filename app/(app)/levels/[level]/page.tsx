import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LevelContentView } from "@/components/levels/level-content-view";
import { LevelPageHeader } from "@/components/levels/level-page-header";
import { LevelSelector } from "@/components/levels/level-selector";
import { buildLevelViewModel, parseLevelNumber } from "@/domains/curriculum";
import { getLevelByLanguageAndNumber, getLevelItems } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

type LevelPageProps = {
  params: Promise<{ level: string }>;
};

export async function generateMetadata({ params }: LevelPageProps): Promise<Metadata> {
  const { level } = await params;
  const levelNumber = parseLevelNumber(level);
  return { title: levelNumber ? `Level ${levelNumber} — Polyglot` : "Polyglot" };
}

/**
 * Spec 10 §2/§5 — one dynamic route backs every level 1-50, not 50
 * hardcoded pages. Browsing here never mutates progress (§26): this page
 * only reads curriculum data.
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
  const level_ = await getLevelByLanguageAndNumber(user.activeLanguageId, levelNumber);
  // A valid-range level with no published `levels` row yet is "not yet
  // published" (spec 10 §29), not a 404 — only the route param's own
  // validity (checked above) is a real not-found case.
  const items = level_ ? await getLevelItems(level_.id) : [];
  const { grammar, vocabulary } = buildLevelViewModel(items);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 sm:px-4">
      <LevelSelector currentLevel={levelNumber} />
      <LevelPageHeader levelNumber={levelNumber} />
      <LevelContentView grammar={grammar} vocabulary={vocabulary} />
    </div>
  );
}
