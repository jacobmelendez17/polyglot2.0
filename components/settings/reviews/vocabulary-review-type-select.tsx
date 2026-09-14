"use client";

import { updateVocabularyReviewTypeAction } from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import { REVIEW_TYPE_OPTIONS } from "./review-type-options";
import type { ReviewType } from "@/domains/srs";

type VocabularyReviewTypeSelectProps = {
  initialValue: ReviewType;
};

/** Spec 20 Reviews — Vocabulary Review Type. */
export function VocabularyReviewTypeSelect({ initialValue }: VocabularyReviewTypeSelectProps) {
  return (
    <InlineSelectSettingField
      label="Vocabulary Review Type"
      initialValue={initialValue}
      options={REVIEW_TYPE_OPTIONS}
      onSave={async (reviewType) => {
        const result = await updateVocabularyReviewTypeAction({ reviewType });
        return result.ok
          ? { ok: true, value: result.data.vocabularyReviewType as ReviewType }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
