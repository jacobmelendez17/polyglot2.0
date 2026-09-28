"use client";

import { useState } from "react";

import { updateCurriculumPreferenceAction } from "@/app/(app)/settings/lessons/actions";
import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import { SettingSaveControls } from "@/components/settings/setting-save-controls";
import type { SettingSaveState } from "@/components/settings/setting-save-controls";
import type { LessonThemeChoice } from "@/domains/lessons";
import type { CurriculumMode } from "@/domains/users";

type LearningQueuePickerProps = {
  initialMode: CurriculumMode;
  initialThemeId: string | null;
  themes: LessonThemeChoice[];
};

/**
 * Spec 20 Lessons — Learning Queue. Wraps the shared `CurriculumModePicker`
 * (also used by onboarding and the Sandbox preview). Picking a mode or a
 * theme only changes the local draft — it has no effect until Save is
 * clicked (2026-09-28 user request: every Settings card requires an
 * explicit Save, reversing this component's original "changes persist
 * immediately" design). Mode and theme are saved together in one request,
 * same as before; Cancel reverts both to the last applied combination.
 *
 * Saving `choose_group` with no theme picked yet is a legitimate, already-
 * handled state (`selectLessonBatch`/`isThemeSelectionRequired` both treat
 * "no selection" as "ask on the next lesson"), so Save is never blocked on
 * a theme being chosen.
 */
export function LearningQueuePicker({
  initialMode,
  initialThemeId,
  themes,
}: LearningQueuePickerProps) {
  const [savedMode, setSavedMode] = useState<CurriculumMode>(initialMode);
  const [savedThemeId, setSavedThemeId] = useState<string | null>(
    initialThemeId,
  );
  const [mode, setMode] = useState<CurriculumMode>(initialMode);
  const [themeId, setThemeId] = useState<string | null>(initialThemeId);
  const [state, setState] = useState<SettingSaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Only `choose_group` ever has a meaningful theme id — every other mode
  // is compared as if it always carried `null`, matching what the database
  // itself enforces.
  const effectiveThemeId = mode === "choose_group" ? themeId : null;
  const savedEffectiveThemeId =
    savedMode === "choose_group" ? savedThemeId : null;
  const isDirty =
    mode !== savedMode || effectiveThemeId !== savedEffectiveThemeId;

  function handleSelectMode(nextMode: CurriculumMode) {
    setMode(nextMode);
    setState("idle");
    setErrorMessage(null);
  }

  function handleSelectTheme(nextThemeId: string) {
    setThemeId(nextThemeId);
    setState("idle");
    setErrorMessage(null);
  }

  function handleCancel() {
    setMode(savedMode);
    setThemeId(savedThemeId);
    setState("idle");
    setErrorMessage(null);
  }

  async function handleSave() {
    setState("saving");
    setErrorMessage(null);
    const result = await updateCurriculumPreferenceAction({
      curriculumMode: mode,
      selectedVocabularyGroupId: effectiveThemeId,
    });

    if (!result.ok) {
      setState("error");
      setErrorMessage(result.error.message);
      return;
    }
    setSavedMode(result.data.curriculumMode as CurriculumMode);
    setSavedThemeId(result.data.selectedVocabularyGroupId);
    setState("saved");
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
