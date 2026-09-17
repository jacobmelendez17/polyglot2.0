"use client";

import {
  updateGrammarSrsStrictnessAction,
  updateVocabularySrsStrictnessAction,
} from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { SrsStrictness } from "@/domains/srs";

const OPTIONS: { value: SrsStrictness; label: string }[] = [
  { value: "one_stage", label: "1 Stage" },
  { value: "two_stages", label: "2 Stages" },
  { value: "three_stages", label: "3 Stages" },
  { value: "half", label: "Half" },
  { value: "full", label: "Full" },
];

type SrsStrictnessSelectProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: SrsStrictness;
};

/** Spec 20 SRS Strictness — Grammar/Vocabulary SRS Strictness. Changes incorrect-review demotion only; correct reviews always advance normally. */
export function SrsStrictnessSelect({
  contentType,
  initialValue,
}: SrsStrictnessSelectProps) {
  const action =
    contentType === "grammar"
      ? updateGrammarSrsStrictnessAction
      : updateVocabularySrsStrictnessAction;

  return (
    <InlineSelectSettingField
      label={
        contentType === "grammar"
          ? "Grammar SRS Strictness"
          : "Vocabulary SRS Strictness"
      }
      description="How far an item drops on an incorrect review. Applies to your next review session, not one already open."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (srsStrictness) => {
        const result = await action({ srsStrictness });
        return result.ok
          ? { ok: true, value: result.data.srsStrictness as SrsStrictness }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
