import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LevelItemBoard } from "@/components/admin/curriculum/level-item-board";
import { AdminLevelEditApp } from "@/components/admin/react-admin/levels/level-edit-app";
import { canManageCurriculum } from "@/domains/admin";
import { CURRICULUM_REORDER_LIMIT } from "@/domains/curriculum";
import {
  getAdminCurriculumItems,
  getLevelById,
  getLevelContentCounts,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";
import { env } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ levelId: string }>;
}): Promise<Metadata> {
  const { levelId } = await params;
  const level = await getLevelById(levelId);
  return {
    title: level
      ? `Level ${level.levelNumber} — Polyglot Admin`
      : "Level — Polyglot Admin",
  };
}

/**
 * Spec 11 rewrite's "Levels Management" detail page, extended by spec 17 into
 * the place a level's whole curriculum is arranged: every vocabulary and
 * grammar item it holds, in lesson-queue order, movable between levels,
 * groups, and positions.
 *
 * Spec 26 Unit 4 moved the level's own properties (name, CEFR band, status)
 * onto a React Admin form — editable for an Admin, read-only for a writer. The
 * heading and the specialist `LevelItemBoard` stay server-rendered and
 * unchanged; the form asks the page to re-render after a save.
 *
 * `includeUnpublished` is deliberate — this is the surface an Admin uses to
 * *decide* what to publish, so a pending item that has never been live is
 * exactly what needs to be visible here.
 */
export default async function LevelDetailPage({
  params,
}: {
  params: Promise<{ levelId: string }>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { levelId } = await params;
  const level = await getLevelById(levelId);
  if (!level) notFound();

  const [counts, vocabularyPage, grammarPage, levels, groups] =
    await Promise.all([
      getLevelContentCounts(levelId),
      // A level's whole contents, not a page of them: this view is the level's
      // running order, and an order with a page break in it is not an order.
      // One query per type, because the order is a level *and type's*
      // (`position` is unique within the pair) and saving one is refused unless
      // the list holds every item of the pair — at most
      // `CURRICULUM_REORDER_LIMIT` of them (spec 26 Unit 7). A single query
      // for both types would run out at that many items in total, and cut
      // each type's list short while neither type was over the limit.
      getAdminCurriculumItems({
        languageId: level.languageId,
        levelId,
        type: "vocabulary",
        limit: CURRICULUM_REORDER_LIMIT,
      }),
      getAdminCurriculumItems({
        languageId: level.languageId,
        levelId,
        type: "grammar",
        limit: CURRICULUM_REORDER_LIMIT,
      }),
      getLevelsByLanguage(level.languageId),
      getVocabularyGroupsByLanguage(level.languageId),
    ]);
  const items = [...vocabularyPage.items, ...grammarPage.items];
  // A type with more items than that cannot be arranged here; say so rather
  // than offer a list whose save is always refused.
  const overLimitTypes = [
    vocabularyPage.nextCursor ? "vocabulary" : null,
    grammarPage.nextCursor ? "grammar" : null,
  ].filter((type) => type !== null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <AdminPageHeader
          title={`Level ${level.levelNumber}${level.name ? ` — ${level.name}` : ""}`}
          description="Edit level properties, and arrange everything it teaches."
        />
        {/* `key` remounts the form when navigating to another level, for the
            same reason as the board's below: Next reuses this page component
            across two `[levelId]` routes, and the form keeps the previous
            level's values in its own state. */}
        <AdminLevelEditApp
          key={level.id}
          signInPath={env.NEXT_PUBLIC_CLERK_SIGN_IN_URL}
          levelId={level.id}
          levelNumber={level.levelNumber}
          fields={{
            name: level.name,
            cefrLevel: level.cefrLevel,
            status: level.status,
          }}
          counts={counts}
        />
      </div>

      {/* `key` forces a remount when navigating to a different level — same
          fix, same reason, as GroupReorderList's own key (see that
          component's render site for the full explanation). Next's App
          Router reuses this same page component across two `[levelId]`
          routes rather than remounting it, so without the key,
          LevelItemBoard's nested per-type reorder state would keep the
          previous level's item ids and silently render every row as null
          for the level actually being viewed. */}
      {overLimitTypes.length > 0 ? (
        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          This level has more than {CURRICULUM_REORDER_LIMIT}{" "}
          {overLimitTypes.join(" or ")} items, which is more than the order tool
          can arrange at once. The board shows the first{" "}
          {CURRICULUM_REORDER_LIMIT} of each, and saving an order is refused.
        </p>
      ) : null}

      <LevelItemBoard
        key={level.id}
        levelId={level.id}
        items={items}
        levels={levels.map((option) => ({
          id: option.id,
          levelNumber: option.levelNumber,
        }))}
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          levelId: group.levelId,
        }))}
      />
    </div>
  );
}
