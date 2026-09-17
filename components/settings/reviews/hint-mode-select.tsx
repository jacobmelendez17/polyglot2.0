"use client";

import {
  updateGrammarHintModeAction,
  updateVocabularyHintModeAction,
} from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { HintMode } from "@/domains/srs";

const OPTIONS: { value: HintMode; label: string }[] = [
  { value: "hide", label: "Hide" },
  { value: "hint", label: "Hint" },
  { value: "show", label: "Show" },
  { value: "more", label: "More" },
  { value: "always_show_nuance", label: "Always Show Nuance" },
];

type HintModeSelectProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: HintMode;
};

/** Spec 20 Review Hints — Grammar/Vocabulary Hint Mode. */
export function HintModeSelect({
  contentType,
  initialValue,
}: HintModeSelectProps) {
  const action =
    contentType === "grammar"
      ? updateGrammarHintModeAction
      : updateVocabularyHintModeAction;

  return (
    <InlineSelectSettingField
      label={contentType === "grammar" ? "Grammar Hint" : "Vocabulary Hint"}
      description="How much help appears before you answer a review — from nothing (Hide) to the full meaning and context (More)."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (hintMode) => {
        const result = await action({ hintMode });
        return result.ok
          ? { ok: true, value: result.data.hintMode as HintMode }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
