"use client";

import { updateLessonBatchSizeAction } from "@/app/(app)/settings/lessons/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import { MAX_LESSON_BATCH_SIZE, MIN_LESSON_BATCH_SIZE } from "@/domains/users";

type BatchSizeOption = `${number}`;

const OPTIONS: { value: BatchSizeOption; label: string }[] = Array.from(
  { length: MAX_LESSON_BATCH_SIZE - MIN_LESSON_BATCH_SIZE + 1 },
  (_, index) => {
    const size = MIN_LESSON_BATCH_SIZE + index;
    return { value: String(size) as BatchSizeOption, label: String(size) };
  },
);

type LessonBatchSizeSelectProps = {
  initialValue: number;
};

/**
 * Spec 20 Lessons — Lesson Batch Size: "the maximum preferred lesson batch
 * size." A `Select` only ever hands back strings, so the option value is the
 * size's string form and is parsed back to a number before it reaches the
 * server action.
 */
export function LessonBatchSizeSelect({ initialValue }: LessonBatchSizeSelectProps) {
  return (
    <InlineSelectSettingField
      label="Lesson Batch Size"
      description="The maximum number of new items in each lesson. A lesson may have fewer if fewer are eligible. Changes affect your next lesson, not one already open."
      initialValue={String(initialValue) as BatchSizeOption}
      options={OPTIONS}
      onSave={async (value) => {
        const result = await updateLessonBatchSizeAction({ lessonBatchSize: Number(value) });
        return result.ok
          ? { ok: true, value: String(result.data.lessonBatchSize) as BatchSizeOption }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
