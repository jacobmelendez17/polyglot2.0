"use client";

import {
  updateGrammarSrsIntervalModeAction,
  updateVocabularySrsIntervalModeAction,
} from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { SrsIntervalMode } from "@/domains/srs";

const OPTIONS: { value: SrsIntervalMode; label: string }[] = [
  { value: "shortest", label: "Shortest" },
  { value: "shorter", label: "Shorter" },
  { value: "default", label: "Default" },
  { value: "longer", label: "Longer" },
  { value: "longest", label: "Longest" },
];

type SrsIntervalModeSelectProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: SrsIntervalMode;
};

export function SrsIntervalModeSelect({
  contentType,
  initialValue,
}: SrsIntervalModeSelectProps) {
  const action =
    contentType === "grammar"
      ? updateGrammarSrsIntervalModeAction
      : updateVocabularySrsIntervalModeAction;
  return (
    <InlineSelectSettingField
      label={
        contentType === "grammar"
          ? "Grammar SRS Interval"
          : "Vocabulary SRS Interval"
      }
      description="Changing your SRS interval only affects reviews scheduled from this point forward. Reviews that already have a due time keep their existing due time."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (srsIntervalMode) => {
        const result = await action({ srsIntervalMode });
        return result.ok
          ? { ok: true, value: result.data.srsIntervalMode as SrsIntervalMode }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
