"use client";

import { useState } from "react";

import { updateCurriculumPreferenceAction } from "@/app/(app)/settings/lessons/actions";
import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import type { LessonThemeChoice } from "@/domains/lessons";
import type { CurriculumMode } from "@/domains/users";

type SaveState = "idle" | "saving" | "saved" | "error";

type LearningQueuePickerProps = {
  initialMode: CurriculumMode;
  initialThemeId: string | null;
  themes: LessonThemeChoice[];
};

/**
 * Spec 20 Lessons — Learning Queue. Wraps the shared `CurriculumModePicker`
 * (also used by onboarding and the Sandbox preview) with Settings' own save
 * semantics: "changing Learning Queue persists immediately" — no "Continue"
 * button, unlike the onboarding flow's `CurriculumChoiceView`.
 *
 * Choose Group as You Go needs a group before there is anything valid to
 * save; every other mode saves the instant it's picked.
 */
export function LearningQueuePicker({ initialMode, initialThemeId, themes }: LearningQueuePickerProps) {
  const [mode, setMode] = useState<CurriculumMode>(initialMode);
  const [themeId, setThemeId] = useState<string | null>(initialThemeId);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function save(nextMode: CurriculumMode, nextThemeId: string | null) {
    setState("saving");
    setErrorMessage(null);
    const result = await updateCurriculumPreferenceAction({
      curriculumMode: nextMode,
      selectedVocabularyGroupId: nextMode === "choose_group" ? nextThemeId : null,
    });

    if (!result.ok) {
      setState("error");
      setErrorMessage(result.error.message);
      return;
    }
    setState("saved");
  }

  function handleSelectMode(nextMode: CurriculumMode) {
    setMode(nextMode);
    if (nextMode !== "choose_group") {
      setThemeId(null);
      void save(nextMode, null);
      return;
    }
    // Choose Group as You Go with a group already selected (switching back
    // into this mode) can save right away; otherwise wait for a pick.
    if (themeId) void save(nextMode, themeId);
  }

  function handleSelectTheme(nextThemeId: string) {
    setThemeId(nextThemeId);
    void save("choose_group", nextThemeId);
  }

  return (
    <div className="flex flex-col gap-3">
      <CurriculumModePicker
        selectedMode={mode}
        onSelectMode={handleSelectMode}
        themes={themes}
        selectedThemeId={themeId}
        onSelectTheme={handleSelectTheme}
        disabled={state === "saving"}
      />
      <p className="text-sm" aria-live="polite">
        {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
        {state === "saved" && <span className="text-state-success">Saved</span>}
        {state === "error" && <span className="text-destructive">{errorMessage ?? "Could not save setting."}</span>}
      </p>
    </div>
  );
}
