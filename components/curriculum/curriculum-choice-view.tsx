"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setCurriculumPreferenceAction } from "@/app/(onboarding)/onboarding/curriculum/actions";
import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import { ONBOARDING_CONTENT_WIDTH } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import type { CurriculumMode } from "@/domains/users";
import { cn } from "@/lib/utils";

type CurriculumChoiceViewProps = {
  /** The learner's stored choice, when they are revisiting rather than deciding for the first time. */
  initialMode?: CurriculumMode | null;
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
 *
 * Only the mode is chosen here (2026-09-27 decision): Theme Selection's
 * specific group is picked later, at the dashboard, when a lesson is
 * actually started — showing that list here duplicates a decision the
 * learner hasn't reached yet, so `CurriculumModePicker` renders with
 * `showThemeSelection={false}` and every save carries a `null` group.
 */
export function CurriculumChoiceView({
  initialMode = null,
  continueHref,
  isPreview = false,
}: CurriculumChoiceViewProps) {
  const router = useRouter();
  const [mode, setMode] = useState<CurriculumMode | null>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleContinue() {
    if (!mode) return;
    setError(null);

    if (isPreview) {
      // A preview persists nothing; it just ends where it was launched from.
      router.replace(continueHref);
      return;
    }

    startSaving(async () => {
      const result = await setCurriculumPreferenceAction({
        curriculumMode: mode,
        selectedVocabularyGroupId: null,
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

      <div
        className={cn("flex w-full flex-col gap-8", ONBOARDING_CONTENT_WIDTH)}
      >
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold text-balance text-foreground sm:text-4xl">
            Choose your learning curriculum
          </h1>
          <p className="text-base text-pretty text-muted-foreground sm:text-lg">
            This gives you new words and lessons based on your learning
            preference. Change it any time.
          </p>
        </div>

        <CurriculumModePicker
          selectedMode={mode}
          onSelectMode={setMode}
          disabled={isSaving}
          showThemeSelection={false}
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
            disabled={!mode || isSaving}
            onClick={handleContinue}
          >
            {isSaving ? "Saving…" : "Start learning"}
          </Button>
        </div>
      </div>
    </div>
  );
}
