import type { Metadata } from "next";

import { AutoPronounceToggle } from "@/components/settings/lessons/auto-pronounce-toggle";
import { GrammarPlacementSelect } from "@/components/settings/lessons/grammar-placement-select";
import { LearningQueuePicker } from "@/components/settings/lessons/learning-queue-picker";
import { LessonBatchSizeSelect } from "@/components/settings/lessons/lesson-batch-size-select";
import { DEFAULT_AUTO_PRONOUNCE_LESSONS, DEFAULT_LESSON_BATCH_SIZE } from "@/domains/users";
import { listAvailableThemes } from "@/domains/lessons/server";
import { getLanguageSettings, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Lesson Settings — Polyglot",
};

export default async function LessonSettingsPage() {
  const user = await requireUser();
  const [settings, themes] = await Promise.all([
    getLanguageSettings(user.id, user.activeLanguageId),
    listAvailableThemes({ userId: user.id, languageId: user.activeLanguageId }),
  ]);

  // `(app)`'s layout already redirects to /onboarding/curriculum when this
  // is null (the learner has never chosen at all), so this is a defensive
  // fallback rather than a real path — matching `lesson-service.ts`'s own
  // `FALLBACK_CURRICULUM_MODE`.
  const currentMode = settings?.curriculumMode ?? "variety";
  const currentThemeId = settings?.selectedVocabularyGroupId ?? null;
  const currentGrammarPlacement = settings?.grammarPlacement ?? "no_preference";
  const currentBatchSize = settings?.lessonBatchSize ?? DEFAULT_LESSON_BATCH_SIZE;
  const currentAutoPronounce = settings?.autoPronounceLessons ?? DEFAULT_AUTO_PRONOUNCE_LESSONS;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Curriculum</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how new words and grammar are introduced in your lessons.
        </p>
        <div className="mt-4">
          <LearningQueuePicker initialMode={currentMode} initialThemeId={currentThemeId} themes={themes} />
        </div>
        <div className="mt-2">
          <GrammarPlacementSelect initialValue={currentGrammarPlacement} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Batch &amp; Audio</h2>
        <p className="mt-1 text-sm text-muted-foreground">Control how many items each lesson introduces and whether they&apos;re pronounced for you.</p>
        <div className="mt-4">
          <LessonBatchSizeSelect initialValue={currentBatchSize} />
        </div>
        <div className="mt-2">
          <AutoPronounceToggle initialValue={currentAutoPronounce} />
        </div>
      </div>
    </div>
  );
}
