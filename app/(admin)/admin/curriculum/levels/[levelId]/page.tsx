import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LevelEditForm } from "@/components/admin/curriculum/level-edit-form";
import { LevelItemBoard } from "@/components/admin/curriculum/level-item-board";
import { canManageCurriculum } from "@/domains/admin";
import {
  getAdminCurriculumItems,
  getLevelById,
  getLevelContentCounts,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export async function generateMetadata({ params }: { params: Promise<{ levelId: string }> }): Promise<Metadata> {
  const { levelId } = await params;
  const level = await getLevelById(levelId);
  return { title: level ? `Level ${level.levelNumber} — Polyglot Admin` : "Level — Polyglot Admin" };
}

/**
 * Spec 11 rewrite's "Levels Management" detail page, extended by spec 17 into
 * the place a level's whole curriculum is arranged: every vocabulary and
 * grammar item it holds, in lesson-queue order, movable between levels,
 * groups, and positions.
 *
 * `includeUnpublished` is deliberate — this is the surface an Admin uses to
 * *decide* what to publish, so a pending item that has never been live is
 * exactly what needs to be visible here.
 */
export default async function LevelDetailPage({ params }: { params: Promise<{ levelId: string }> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { levelId } = await params;
  const level = await getLevelById(levelId);
  if (!level) notFound();

  const [counts, itemsPage, levels, groups] = await Promise.all([
    getLevelContentCounts(levelId),
    // A level's whole contents, not a page of them: this view is the level's
    // running order, and an order with a page break in it is not an order.
    getAdminCurriculumItems({ languageId: level.languageId, levelId, limit: 100 }),
    getLevelsByLanguage(level.languageId),
    getVocabularyGroupsByLanguage(level.languageId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <AdminPageHeader
          title={`Level ${level.levelNumber}${level.name ? ` — ${level.name}` : ""}`}
          description="Edit level properties, and arrange everything it teaches."
        />
        <LevelEditForm levelId={level.id} name={level.name} status={level.status} cefrLevel={level.cefrLevel} counts={counts} />
      </div>

      <LevelItemBoard
        levelId={level.id}
        items={itemsPage.items}
        levels={levels.map((option) => ({ id: option.id, levelNumber: option.levelNumber }))}
        groups={groups.map((group) => ({ id: group.id, name: group.name, levelId: group.levelId }))}
      />
    </div>
  );
}
