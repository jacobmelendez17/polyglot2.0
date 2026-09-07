import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { LevelEditForm } from "@/components/admin/curriculum/level-edit-form";
import { canManageCurriculum } from "@/domains/admin";
import { evaluateLevelValidation } from "@/domains/curriculum";
import { getLevelById, getLevelValidationCounts } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export async function generateMetadata({ params }: { params: Promise<{ levelId: string }> }): Promise<Metadata> {
  const { levelId } = await params;
  const level = await getLevelById(levelId);
  return { title: level ? `Level ${level.levelNumber} — Polyglot Admin` : "Level — Polyglot Admin" };
}

/** Spec 11 rewrite's "Levels Management" detail/edit page. */
export default async function LevelDetailPage({ params }: { params: Promise<{ levelId: string }> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { levelId } = await params;
  const level = await getLevelById(levelId);
  if (!level) notFound();

  const counts = await getLevelValidationCounts(levelId);

  return (
    <div>
      <AdminPageHeader
        title={`Level ${level.levelNumber}${level.name ? ` — ${level.name}` : ""}`}
        description="Edit level properties and review publication readiness."
      />
      <LevelEditForm levelId={level.id} name={level.name} status={level.status} validation={evaluateLevelValidation(counts)} />
    </div>
  );
}
