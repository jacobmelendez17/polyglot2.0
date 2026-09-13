import type { Metadata } from "next";

import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";

export const metadata: Metadata = {
  title: "General Settings — Polyglot",
};

export default function GeneralSettingsPage() {
  return (
    <SettingsSectionPlaceholder
      title="General"
      description="Timezone, Hide English during Reviews, NSFW content, and Vacation Mode."
    />
  );
}
