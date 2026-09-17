"use client";

import { updateContentPreferencesAction } from "@/app/(app)/settings/general/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type NsfwContentToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 General — NSFW Content (default OFF). Filtering is enforced
 * server-side, not by this toggle's own logic — see
 * `domains/curriculum`'s `databaseCurriculumReader`, which resolves this
 * same stored preference before selecting lesson items.
 */
export function NsfwContentToggle({ initialValue }: NsfwContentToggleProps) {
  return (
    <InlineToggleSettingField
      label="Show NSFW Content"
      initialValue={initialValue}
      onSave={async (showNsfwContent) => {
        const result = await updateContentPreferencesAction({
          showNsfwContent,
        });
        return result.ok
          ? { ok: true, value: result.data.showNsfwContent }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
