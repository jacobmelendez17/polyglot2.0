"use client";

import { updateNotificationPreferencesAction } from "@/app/(app)/settings/notifications/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type TrialEmailsToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 Notifications — Trial Emails. "Receive optional emails about
 * trials and reminders before a trial ends." No trial-specific messages
 * are sent until subscription/trial infrastructure exists — this stores
 * the preference only.
 */
export function TrialEmailsToggle({ initialValue }: TrialEmailsToggleProps) {
  return (
    <InlineToggleSettingField
      label="Trial Emails"
      description="Receive optional emails about trials and reminders before a trial ends."
      initialValue={initialValue}
      onSave={async (trialEmail) => {
        const result = await updateNotificationPreferencesAction({ trialEmail });
        return result.ok ? { ok: true, value: result.data.trialEmail } : { ok: false, message: result.error.message };
      }}
    />
  );
}
