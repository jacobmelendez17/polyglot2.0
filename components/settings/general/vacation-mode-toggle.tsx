"use client";

import {
  disableVacationModeAction,
  enableVacationModeAction,
} from "@/app/(app)/settings/general/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type VacationModeToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 General — Vacation Mode. Account-wide, not language-specific.
 * Turning it off is the direction that actually reconciles every scheduled
 * review server-side (`domains/users`' `disableVacationMode`) — this
 * component just calls the right action for the direction the learner
 * chose.
 */
export function VacationModeToggle({ initialValue }: VacationModeToggleProps) {
  return (
    <InlineToggleSettingField
      label="Vacation Mode"
      description="Freeze review scheduling and protect your streak while you're away."
      initialValue={initialValue}
      onSave={async (enabled) => {
        const result = enabled
          ? await enableVacationModeAction()
          : await disableVacationModeAction();
        return result.ok
          ? { ok: true, value: result.data.vacationModeEnabled }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
