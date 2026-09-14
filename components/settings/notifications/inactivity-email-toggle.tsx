"use client";

import { updateNotificationPreferencesAction } from "@/app/(app)/settings/notifications/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type InactivityEmailToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 Notifications — Inactivity Email. "Receive an encouragement
 * email after being inactive." The exact inactivity duration and the
 * background job that would send it are deferred to when the email
 * workflow itself is implemented — this stores the preference only.
 */
export function InactivityEmailToggle({ initialValue }: InactivityEmailToggleProps) {
  return (
    <InlineToggleSettingField
      label="Inactivity Email"
      description="Receive an encouragement email after being inactive."
      initialValue={initialValue}
      onSave={async (inactivityEmail) => {
        const result = await updateNotificationPreferencesAction({ inactivityEmail });
        return result.ok ? { ok: true, value: result.data.inactivityEmail } : { ok: false, message: result.error.message };
      }}
    />
  );
}
