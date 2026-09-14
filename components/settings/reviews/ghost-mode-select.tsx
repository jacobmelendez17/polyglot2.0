"use client";

import { updateGrammarGhostModeAction, updateVocabularyGhostModeAction } from "@/app/(app)/settings/reviews/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { GhostMode } from "@/domains/srs";

const OPTIONS: { value: GhostMode; label: string }[] = [
  { value: "on", label: "On" },
  { value: "minimal", label: "Minimal" },
  { value: "off", label: "Off" },
];

type GhostModeSelectProps = {
  contentType: "grammar" | "vocabulary";
  initialValue: GhostMode;
};

/** Spec 20 Ghost Reviews — Grammar/Vocabulary Ghost Reviews. Controls whether a missed sentence spins up a supplemental Ghost review, separate from normal SRS. */
export function GhostModeSelect({ contentType, initialValue }: GhostModeSelectProps) {
  const action = contentType === "grammar" ? updateGrammarGhostModeAction : updateVocabularyGhostModeAction;

  return (
    <InlineSelectSettingField
      label={contentType === "grammar" ? "Grammar Ghost Reviews" : "Vocabulary Ghost Reviews"}
      description="On creates a Ghost review after one missed sentence. Minimal waits for a second miss. Off stops new Ghosts — existing ones stay until reset from Danger Zone."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (ghostMode) => {
        const result = await action({ ghostMode });
        return result.ok ? { ok: true, value: result.data.ghostMode as GhostMode } : { ok: false, message: result.error.message };
      }}
    />
  );
}
