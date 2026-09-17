"use client";

import { updateGrammarPlacementAction } from "@/app/(app)/settings/lessons/actions";
import { InlineSelectSettingField } from "@/components/settings/inline-select-setting-field";
import type { GrammarPlacement } from "@/domains/users";

const OPTIONS: { value: GrammarPlacement; label: string }[] = [
  { value: "first", label: "First" },
  { value: "last", label: "Last" },
  { value: "no_preference", label: "No Preference" },
];

type GrammarPlacementSelectProps = {
  initialValue: GrammarPlacement;
};

/**
 * Spec 20 Lessons — Grammar Placement. Only meaningful in Variety mode
 * (Default Order always teaches grammar first; Choose Group as You Go
 * follows the grammar curriculum's own order regardless) — shown always
 * rather than hidden/disabled under the other modes, since the setting
 * still has a real stored value and takes effect the moment Variety is
 * chosen, per "this setting changes learner-specific queue ordering only."
 */
export function GrammarPlacementSelect({
  initialValue,
}: GrammarPlacementSelectProps) {
  return (
    <InlineSelectSettingField
      label="Grammar Placement"
      description="Only applies to Variety — Default Order and Choose Group as You Go set grammar's position on their own."
      initialValue={initialValue}
      options={OPTIONS}
      onSave={async (grammarPlacement) => {
        const result = await updateGrammarPlacementAction({ grammarPlacement });
        return result.ok
          ? {
              ok: true,
              value: result.data.grammarPlacement as GrammarPlacement,
            }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
