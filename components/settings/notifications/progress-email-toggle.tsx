"use client";

import { updateNotificationPreferencesAction } from "@/app/(app)/settings/notifications/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type ProgressEmailToggleProps = {
  initialValue: boolean;
};

/**
 * Spec 20 Notifications — Progress Email. "Receive a progress and review
 * summary every two weeks." No email is sent until the future
 * notification-delivery system exists — this stores the preference only.
 */
export function ProgressEmailToggle({
  initialValue,
}: ProgressEmailToggleProps) {
  return (
    <InlineToggleSettingField
      label="Progress Email"
      description="Receive a progress and review summary every two weeks."
      initialValue={initialValue}
      onSave={async (progressEmail) => {
        const result = await updateNotificationPreferencesAction({
          progressEmail,
        });
        return result.ok
          ? { ok: true, value: result.data.progressEmail }
          : { ok: false, message: result.error.message };
      }}
    />
  );
}
