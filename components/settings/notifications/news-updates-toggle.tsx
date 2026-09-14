"use client";

import { updateNotificationPreferencesAction } from "@/app/(app)/settings/notifications/actions";
import { InlineToggleSettingField } from "@/components/settings/inline-toggle-setting-field";

type NewsUpdatesToggleProps = {
  initialValue: boolean;
};

/** Spec 20 Notifications — News & Updates. Optional Polyglot news/product-update email. */
export function NewsUpdatesToggle({ initialValue }: NewsUpdatesToggleProps) {
  return (
    <InlineToggleSettingField
      label="News & Updates"
      initialValue={initialValue}
      onSave={async (newsUpdates) => {
        const result = await updateNotificationPreferencesAction({ newsUpdates });
        return result.ok ? { ok: true, value: result.data.newsUpdates } : { ok: false, message: result.error.message };
      }}
    />
  );
}
