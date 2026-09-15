import type { Metadata } from "next";

import { ContentTypeResetPanel } from "@/components/settings/danger/content-type-reset-panel";
import { ResetToLevelPanel } from "@/components/settings/danger/reset-to-level-panel";
import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";
import { getLevelsByLanguage } from "@/domains/curriculum/server";
import { getUnlockedLevels } from "@/domains/progress/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Danger Zone — Polyglot",
};

export default async function DangerZoneSettingsPage() {
  const user = await requireUser();
  const [allLevels, unlockedLevels] = await Promise.all([
    getLevelsByLanguage(user.activeLanguageId),
    getUnlockedLevels(user.id, user.activeLanguageId),
  ]);

  // Same "current Level = highest unlocked Level" computation
  // `dashboard-service.ts` uses — see that file for why.
  const levelNumberById = new Map(allLevels.map((level) => [level.id, level.levelNumber]));
  const unlockedLevelNumbers = unlockedLevels
    .map((progress) => levelNumberById.get(progress.levelId))
    .filter((levelNumber): levelNumber is number => levelNumber !== undefined)
    .sort((a, b) => a - b);
  const currentLevelNumber = unlockedLevelNumbers.length > 0 ? Math.max(...unlockedLevelNumbers) : 1;
  const earlierLevelNumbers = unlockedLevelNumbers.filter((levelNumber) => levelNumber < currentLevelNumber);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-destructive">Reset Reviews</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Resets your review progress for one content type. Choose exactly what to reset before confirming — nothing is reset
          just by changing this dropdown.
        </p>
        <div className="mt-4">
          <ContentTypeResetPanel contentType="grammar" />
          <ContentTypeResetPanel contentType="vocabulary" />
        </div>
      </div>

      <div className="rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-destructive">Reset to Level</h2>
        <div className="mt-4">
          <ResetToLevelPanel currentLevelNumber={currentLevelNumber} earlierLevelNumbers={earlierLevelNumbers} />
        </div>
      </div>

      <SettingsSectionPlaceholder
        title="More Danger Zone actions"
        description="Manual streak adjustment, resetting dismissed warnings, resetting your entire account, and deleting your account."
      />
    </div>
  );
}
