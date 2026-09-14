"use client";

import { updateGrammarHintOrderAction, updateVocabularyHintOrderAction } from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { HintOrder } from "@/domains/srs";

const OPTIONS: { value: HintOrder; label: string }[] = [
  { value: "nuance_first", label: "Nuance First" },
  { value: "translation_first", label: "Translation First" },
];

type HintOrderSelectProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: HintOrder;
};

/** Spec 20 Review Hints — Grammar/Vocabulary Hint Order. Only meaningful when that content type's Hint Mode is "More". */
export function HintOrderSelect({ contentType, initialValue }: HintOrderSelectProps) {
  const action = contentType === "grammar" ? updateGrammarHintOrderAction : updateVocabularyHintOrderAction;

  return (
    <InlineSelectSettingField
      label={contentType === "grammar" ? "Grammar Hint Order" : "Vocabulary Hint Order"}
      description="Only applies when Hint Mode is set to More — it decides which piece of extra help appears first."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (hintOrder) => {
        const result = await action({ hintOrder });
        return result.ok ? { ok: true, value: result.data.hintOrder as HintOrder } : { ok: false, message: result.error.message };
      }}
    />
  );
}
