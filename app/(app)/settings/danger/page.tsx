import type { Metadata } from "next";

import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";

export const metadata: Metadata = {
  title: "Danger Zone — Polyglot",
};

export default function DangerZoneSettingsPage() {
  return (
    <SettingsSectionPlaceholder
      title="Danger Zone"
      description="Reset Grammar/Vocabulary, Reset to Level, manual streak adjustment, resetting dismissed warnings, resetting your entire account, and deleting your account."
    />
  );
}
