"use client";

import { updateContentPreferencesAction } from "@/app/(app)/settings/general/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type HideEnglishToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 General — Hide English During Reviews. "Applies only to normal
 * reviews" and interacts with the Review Hints settings (spec 20's Review
 * Hints section) — this stores the preference now; the review session
 * itself starts reading it once that Hints/Review UI unit builds the
 * reveal logic it composes with.
 */
export function HideEnglishToggle({ initialValue }: HideEnglishToggleProps) {
  return (
    <InlineToggleSettingField
      label="Hide English during Reviews"
      initialValue={initialValue}
      onSave={async (hideEnglishReviews) => {
        const result = await updateContentPreferencesAction({
          hideEnglishReviews,
        });
        return result.ok
          ? { ok: true, value: result.data.hideEnglishReviews }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
