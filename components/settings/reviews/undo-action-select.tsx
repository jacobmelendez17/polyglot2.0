"use client";

import { updateUndoActionAction } from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { UndoAction } from "@/domains/srs";

const OPTIONS: { value: UndoAction; label: string }[] = [
  { value: "clear_last_character", label: "Clear Last Character" },
  { value: "clear_all_characters", label: "Clear All Characters" },
];

type UndoActionSelectProps = {
  initialValue: UndoAction;
};

/** Spec 20 Review UI — Undo Action, for typed review answer fields. */
export function UndoActionSelect({ initialValue }: UndoActionSelectProps) {
  return (
    <InlineSelectSettingField
      label="Undo Action"
      description="What the Undo button does while typing a review answer."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (undoAction) => {
        const result = await updateUndoActionAction({ undoAction });
        return result.ok
          ? { ok: true, value: result.data.undoAction as UndoAction }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
