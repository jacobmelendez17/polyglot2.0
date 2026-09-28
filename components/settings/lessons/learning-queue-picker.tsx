"use client";

import { useState } from "react";

import { updateCurriculumPreferenceAction } from "@/app/(app)/settings/lessons/actions";
import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import type { SettingSaveState } from "@/components/settings/setting-save-controls";
import type { CurriculumMode } from "@/domains/users";

type LearningQueuePickerProps = {
  initialMode: CurriculumMode;
};

/**
 * Spec 20 Lessons — Learning Queue. Wraps the shared `CurriculumModePicker`
 * with `showThemeSelection={false}` — Settings only ever picks the *mode*.
 * Which theme (a vocabulary group, or Grammar) is chosen later, on the
 * lesson-start "What next?" screen (`LessonThemePicker`), the same split
 * onboarding's own `CurriculumModePicker` call already established
 * (2026-09-27 decision) and now applied here too (2026-09-28 user request:
 * "the point of theme selection is that they choose in the lesson queue
 * before they start, not in the settings"). Settings therefore never reads
 * or sends a theme id: switching *into* `choose_group` here always saves
 * `selectedVocabularyGroupId: null`, exactly like onboarding, so the next
 * lesson start asks. Switching mode back and forth without landing on a
 * different mode than what's saved never touches the server at all, so an
 * already-active theme selection from a prior lesson is left alone.
 *
 * Picking a mode only changes the local draft — it has no effect until
 * Save is clicked (2026-09-28 user request: every Settings card requires
 * an explicit Save).
 */
export function LearningQueuePicker({
  initialMode,
}: LearningQueuePickerProps) {
  const [savedMode, setSavedMode] = useState<CurriculumMode>(initialMode);
  const [mode, setMode] = useState<CurriculumMode>(initialMode);
  const [state, setState] = useState<SettingSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDirty = mode !== savedMode;

  function handleSelectMode(nextMode: CurriculumMode) {
    setMode(nextMode);
    setState("idle");
    setErrorMessage(null);
  }

  function handleCancel() {
    setMode(savedMode);
    setState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    setState("saving");
    setErrorMessage(null);
    const result = await updateCurriculumPreferenceAction({
      curriculumMode: mode,
      selectedVocabularyGroupId: null,
    });

    if (!result.ok) {
      setState("error");
      setErrorMessage(result.error.message);
      return;
    }
    setSavedMode(result.data.curriculumMode as CurriculumMode);
    setState("saved");
  }

  return (
    <div className="flex flex-col gap-3">
      <CurriculumModePicker
        selectedMode={mode}
        onSelectMode={handleSelectMode}
        showThemeSelection={false}
        disabled={state === "saving"}
      />
      <SettingSaveControls
        isDirty={isDirty}
        state={state}
        errorMessage={errorMessage}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}
