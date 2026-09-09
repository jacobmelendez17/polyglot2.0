"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setCurriculumPreferenceAction } from "@/app/(onboarding)/onboarding/curriculum/actions";
import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import { ONBOARDING_CONTENT_WIDTH } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import type { LessonThemeChoice } from "@/domains/lessons";
import type { CurriculumMode } from "@/domains/users";
import { cn } from "@/lib/utils";

type CurriculumChoiceViewProps = {
  themes: LessonThemeChoice[];
  /** The learner's stored choice, when they are revisiting rather than deciding for the first time. */
  initialMode?: CurriculumMode | null;
  initialThemeId?: string | null;
  /** Where to go once the choice is saved. */
  continueHref: string;
  /**
   * Sandbox replay (spec 15's pattern, reused for spec 16): the whole screen
   * is previewable, but nothing is written and finishing returns to the
   * Sandbox. The server action refuses a sandbox persona regardless — this
   * flag decides presentation, not authorization.
   */
  isPreview?: boolean;
};

/**
 * The curriculum preference screen (spec 16) — shown once after onboarding,
 * and re-openable afterwards.
 *
 * Nothing is preselected on a first visit. A default would answer the
 * question on the learner's behalf, and the whole point of this screen is
 * that the application does not decide this for them.
 */
export function CurriculumChoiceView({
  themes,
  initialMode = null,
  initialThemeId = null,
  continueHref,
  isPreview = false,
}: CurriculumChoiceViewProps) {
  const router = useRouter();
  const [mode, setMode] = useState<CurriculumMode | null>(initialMode);
  const [themeId, setThemeId] = useState<string | null>(initialThemeId);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // Theme mode with themes available needs one picked; with none available
  // the learner picks at their first lesson instead, so the button stays
  // usable rather than trapping them on a screen with nothing to choose.
  const needsTheme = mode === "theme" && themes.length > 0 && !themeId;
  const canContinue = mode !== null && !needsTheme;

  function handleContinue() {
    if (!mode || needsTheme) return;
    setError(null);

    if (isPreview) {
      // A preview persists nothing; it just ends where it was launched from.
      router.replace(continueHref);
      return;
    }

    startSaving(async () => {
      const result = await setCurriculumPreferenceAction({
        curriculumMode: mode,
        selectedVocabularyGroupId: mode === "theme" ? themeId : null,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace(continueHref);
    });
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-5 py-12 sm:px-8">
      {isPreview ? (
        <p className="fixed inset-x-0 top-0 bg-foreground/85 px-4 py-1.5 text-center text-xs font-medium text-background">
          Sandbox preview — choosing here will not change your own preference.
        </p>
      ) : null}

      <div className={cn("flex w-full flex-col gap-8", ONBOARDING_CONTENT_WIDTH)}>
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold text-balance text-foreground sm:text-4xl">
            How would you like to learn?
          </h1>
          <p className="text-base text-pretty text-muted-foreground sm:text-lg">
            This only changes how new words are chosen for your lessons — nothing you have already learned is
            affected.
          </p>
        </div>

        <CurriculumModePicker
          selectedMode={mode}
          onSelectMode={(next) => {
            setMode(next);
            if (next !== "theme") setThemeId(null);
          }}
          themes={themes}
          selectedThemeId={themeId}
          onSelectTheme={setThemeId}
          disabled={isSaving}
        />

        {error ? (
          <p role="alert" className="text-center text-sm text-state-error">
            {error}
          </p>
        ) : null}

        <div className="flex justify-center">
          <Button
            type="button"
            size="lg"
            className="cursor-pointer"
            disabled={!canContinue || isSaving}
            onClick={handleContinue}
          >
            {isSaving ? "Saving…" : "Start learning"}
          </Button>
        </div>
      </div>
    </div>
  );
}
