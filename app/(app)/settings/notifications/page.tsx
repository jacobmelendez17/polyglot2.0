import type { Metadata } from "next";

import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";

export const metadata: Metadata = {
  title: "Notification Settings — Polyglot",
};

export default function NotificationSettingsPage() {
  return (
    <SettingsSectionPlaceholder
      title="Notifications"
      description="News & Updates, Progress Email, Inactivity Email, and Trial Emails preferences."
    />
  );
}
