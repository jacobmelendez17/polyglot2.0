"use client";

import {
  updateGrammarFluentModeAction,
  updateVocabularyFluentModeAction,
} from "@/app/(app)/settings/reviews/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type FluentModeToggleProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: boolean;
};

/** Spec 20 Fluent Mode — Grammar/Vocabulary, each independently ON by default. */
export function FluentModeToggle({
  contentType,
  initialValue,
}: FluentModeToggleProps) {
  const action =
    contentType === "grammar"
      ? updateGrammarFluentModeAction
      : updateVocabularyFluentModeAction;
  return (
    <InlineToggleSettingField
      label={
        contentType === "grammar"
          ? "Fluent Mode — Grammar"
          : "Fluent Mode — Vocabulary"
      }
      description="When on, a Fluent item gets a maintenance review every 6 months instead of stopping for good. When off, reaching Fluent ends reviews for that item."
      initialValue={initialValue}
      onSave={async (fluentMode) => {
        const result = await action({ fluentMode });
        return result.ok
          ? { ok: true, value: result.data.fluentMode }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
