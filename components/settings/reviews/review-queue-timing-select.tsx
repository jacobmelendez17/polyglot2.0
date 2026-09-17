"use client";

import { updateReviewQueueTimingAction } from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { ReviewQueueTimingMode } from "@/domains/srs";

const OPTIONS: { value: ReviewQueueTimingMode; label: string }[] = [
  { value: "start_of_hour", label: "Start of Hour" },
  { value: "start_of_day", label: "Start of Day" },
];

type ReviewQueueTimingSelectProps = {
  initialValue: ReviewQueueTimingMode;
};

/** Spec 20 Review Queue Timing — one value per language, unlike most other Reviews settings. */
export function ReviewQueueTimingSelect({
  initialValue,
}: ReviewQueueTimingSelectProps) {
  return (
    <InlineSelectSettingField
      label="Review Queue Timing"
      description="Rounds a review's calculated due time forward, applied after the SRS interval. Start of Hour rounds to the next hour; Start of Day aligns to midnight in your timezone."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (reviewQueueTiming) => {
        const result = await updateReviewQueueTimingAction({
          reviewQueueTiming,
        });
        return result.ok
          ? {
              ok: true,
              value: result.data.reviewQueueTiming as ReviewQueueTimingMode,
            }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
