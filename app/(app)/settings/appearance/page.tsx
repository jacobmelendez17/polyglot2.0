import type { Metadata } from "next";

import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";

export const metadata: Metadata = {
  title: "Appearance Settings — Polyglot",
};

export default function AppearanceSettingsPage() {
  return (
    <SettingsSectionPlaceholder
      title="Appearance"
      description="Theme, color palette, font family, font size, and color-blind assistance. Stored on this device."
    />
  );
}
