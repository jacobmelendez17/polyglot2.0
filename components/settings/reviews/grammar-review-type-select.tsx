"use client";

import { updateGrammarReviewTypeAction } from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import { REVIEW_TYPE_OPTIONS } from "./review-type-options";
import type { ReviewType } from "@/domains/srs";

type GrammarReviewTypeSelectProps = {
  initialValue: ReviewType;
};

/** Spec 20 Reviews — Grammar Review Type. */
export function GrammarReviewTypeSelect({ initialValue }: GrammarReviewTypeSelectProps) {
  return (
    <InlineSelectSettingField
      label="Grammar Review Type"
      initialValue={initialValue}
      options={REVIEW_TYPE_OPTIONS}
      onSave={async (reviewType) => {
        const result = await updateGrammarReviewTypeAction({ reviewType });
        return result.ok
          ? { ok: true, value: result.data.grammarReviewType as ReviewType }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
