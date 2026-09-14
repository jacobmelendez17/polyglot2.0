"use client";

import {
  updateGrammarMinimumLeechStageAction,
  updateVocabularyMinimumLeechStageAction,
} from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import { SRS_STAGE_LABELS, SRS_STAGE_ORDER } from "@/domains/srs";
import type { SrsStage } from "@/domains/srs";

const OPTIONS: { value: SrsStage; label: string }[] = SRS_STAGE_ORDER.map((stage) => ({ value: stage, label: SRS_STAGE_LABELS[stage] }));

type MinimumLeechStageSelectProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: SrsStage;
};

/** Spec 20 Leeches — Minimum Grammar/Vocabulary SRS for Leech. An item can't be classified as a Leech until it has reached this stage at least once, checked against the highest stage ever reached, not its current stage. */
export function MinimumLeechStageSelect({ contentType, initialValue }: MinimumLeechStageSelectProps) {
  const action = contentType === "grammar" ? updateGrammarMinimumLeechStageAction : updateVocabularyMinimumLeechStageAction;

  return (
    <InlineSelectSettingField
      label={contentType === "grammar" ? "Minimum Grammar SRS for Leech" : "Minimum Vocabulary SRS for Leech"}
      description="An item can't be flagged as a Leech until it has reached at least this stage once, even if it later falls back below it."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (minimumLeechStage) => {
        const result = await action({ minimumLeechStage });
        return result.ok
          ? { ok: true, value: result.data.minimumLeechStage as SrsStage }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
