"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setActiveLanguageAction } from "@/app/(onboarding)/onboarding/language/actions";
import { ONBOARDING_CONTENT_WIDTH } from "@/components/onboarding/onboarding-layout";
import { Button } from "@/components/ui/button";
import type { CurriculumLanguage } from "@/domains/curriculum";
import { regionFlagEmoji } from "@/lib/language-flag";
import { cn } from "@/lib/utils";

type LanguageChoiceViewProps = {
  languages: CurriculumLanguage[];
  /** The learner's current language, preselected when they are revisiting rather than deciding for the first time. */
  initialLanguageId?: string | null;
  /** Where to go once the choice is saved. In preview mode this is the next screen's own preview, not necessarily the end of the flow (2026-09-26's one-giant-flow decision). */
  continueHref: string;
  /**
   * Sandbox replay, same pattern as `CurriculumChoiceView`'s `isPreview`:
   * the whole screen is previewable, but nothing is written. The server
   * action refuses a sandbox persona regardless — this flag decides
   * presentation, not authorization.
   */
  isPreview?: boolean;
};

/**
 * The language-choice step (2026-09-26, restyled as flag cards 2026-09-27),
 * shown once right after the onboarding slideshow and before the curriculum
 * choice — the first question the app asks about content itself, since
 * curriculum, levels, and lessons are all scoped to a language
 * (architecture.md's "every official curriculum object must be scoped to a
 * language").
 *
 * Data-driven, per architecture.md: this never assumes any one language —
 * it renders one card per configured language and grows automatically as
 * more ship, with a flag (a placeholder for real artwork "for now") and the
 * language's name underneath.
 */
export function LanguageChoiceView({
  languages,
  initialLanguageId = null,
  continueHref,
  isPreview = false,
}: LanguageChoiceViewProps) {
  const router = useRouter();
  const [languageId, setLanguageId] = useState<string | null>(
    initialLanguageId,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleContinue() {
    if (!languageId) return;
    setError(null);

    if (isPreview) {
      // A preview persists nothing; it just moves on to the next screen.
      router.replace(continueHref);
      return;
    }

    startSaving(async () => {
      const result = await setActiveLanguageAction({ languageId });
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
          Sandbox preview — choosing here will not change your own language.
        </p>
      ) : null}

      <div
        className={cn("flex w-full flex-col gap-8", ONBOARDING_CONTENT_WIDTH)}
      >
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-heading text-3xl font-semibold text-balance text-foreground sm:text-4xl">
            What language are you learning?
          </h1>
          <p className="text-base text-pretty text-muted-foreground sm:text-lg">
            You can change this later — nothing you learn is lost when you
            switch.
          </p>
        </div>

        <fieldset
          disabled={isSaving}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <legend className="sr-only">Which language are you learning?</legend>
          {languages.map((language) => {
            const isSelected = languageId === language.id;
            return (
              <label
                key={language.id}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center transition-[border-color,border-width,transform] duration-150",
                  "hover:border-accent-primary/60 focus-within:ring-2 focus-within:ring-ring active:scale-[0.97]",
                  isSelected
                    ? "border-[3px] border-state-success"
                    : "border-border",
                  isSaving && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="active-language"
                  value={language.id}
                  checked={isSelected}
                  onChange={() => setLanguageId(language.id)}
                  aria-label={language.name}
                  className="sr-only"
                />
                <span className="text-4xl" aria-hidden="true">
                  {regionFlagEmoji(language.code)}
                </span>
                <span className="font-medium text-foreground">
                  {language.name}
                </span>
              </label>
            );
          })}
        </fieldset>

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
            disabled={!languageId || isSaving}
            onClick={handleContinue}
          >
            {isSaving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
