"use client";

import { updateAutoPronounceLessonsAction } from "@/app/(app)/settings/lessons/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type AutoPronounceToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 Lessons — Auto Pronunciation. Plays a vocabulary item's
 * pronunciation the moment it's introduced during Lessons, preferring a real
 * recording and falling back to browser speech synthesis. Manual
 * pronunciation controls stay available either way — this only affects
 * whether Lessons also plays it automatically.
 */
export function AutoPronounceToggle({
  initialValue,
}: AutoPronounceToggleProps) {
  return (
    <InlineToggleSettingField
      label="Automatically pronounce new words"
      description="Play pronunciation automatically when a new word is introduced in a lesson."
      initialValue={initialValue}
      onSave={async (autoPronounceLessons) => {
        const result = await updateAutoPronounceLessonsAction({
          autoPronounceLessons,
        });
        return result.ok
          ? { ok: true, value: result.data.autoPronounceLessons }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
