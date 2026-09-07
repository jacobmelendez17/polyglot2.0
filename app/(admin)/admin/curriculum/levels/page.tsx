import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreateLevelDialog } from "@/components/admin/curriculum/create-level-dialog";
import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import { LevelValidationSummary } from "@/components/admin/curriculum/level-validation-summary";
import { canManageCurriculum } from "@/domains/admin";
import { evaluateLevelValidation } from "@/domains/curriculum";
import { getLanguages, getLevelsByLanguage, getLevelValidationCounts } from "@/domains/curriculum/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Levels — Polyglot Admin",
};

type SearchParams = { language?: string };

/**
 * Spec 11 rewrite's "Levels Management" list — shows every configured
 * level for a language with its live curriculum-validation counts, so an
 * admin can see at a glance which levels are publish-ready without opening
 * each one (§"Show curriculum counts").
 */
export default async function AdminLevelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Levels" description="Manage level properties, ordering, and publication readiness." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const languageId = languages.some((l) => l.id === params.language) ? params.language! : languages[0]!.id;
  const levels = await getLevelsByLanguage(languageId);
  const validationCounts = await Promise.all(levels.map((level) => getLevelValidationCounts(level.id)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="Levels" description="Manage level properties, ordering, and publication readiness." />
        <CreateLevelDialog languageId={languageId} />
      </div>

      {levels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No levels yet for this language.</p>
      ) : (
        <ul className="space-y-3">
          {levels.map((level, index) => (
            <li key={level.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link href={`/admin/curriculum/levels/${level.id}`} className="font-semibold text-foreground hover:underline">
                    Level {level.levelNumber}
                    {level.name ? ` — ${level.name}` : ""}
                  </Link>
                  <div className="mt-1.5">
                    <CurriculumStatusBadge status={level.status} />
                  </div>
                </div>
                <div className="w-full sm:w-64">
                  <LevelValidationSummary validation={evaluateLevelValidation(validationCounts[index]!, level.targets)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
