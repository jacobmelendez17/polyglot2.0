"use client";

import { updateReviewUiToggleAction } from "@/app/(app)/settings/reviews/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";
import type { ReviewUiToggleField } from "@/domains/srs";

type ReviewUiToggleProps = {
  field: ReviewUiToggleField;
  label: string;
  description?: string;
  initialValue: boolean;
};

/**
 * Spec 20 Review UI — one component for all seven independent boolean
 * toggles (Autoplay Audio, Lightning Mode, Focus Mode, Auto Highlight
 * Errors, Show SRS Stage, Auto-Expand Info), parametrized by field name
 * rather than duplicated seven times — the same generalization
 * `review-preference-repository.ts`'s `saveReviewUiToggle` already made on
 * the server side.
 */
export function ReviewUiToggle({
  field,
  label,
  description,
  initialValue,
}: ReviewUiToggleProps) {
  return (
    <InlineToggleSettingField
      label={label}
      description={description}
      initialValue={initialValue}
      onSave={async (value) => {
        const result = await updateReviewUiToggleAction({ field, value });
        return result.ok
          ? { ok: true, value: result.data.value }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
