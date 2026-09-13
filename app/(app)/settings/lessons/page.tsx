import type { Metadata } from "next";

import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";

export const metadata: Metadata = {
  title: "Lesson Settings — Polyglot",
};

export default function LessonSettingsPage() {
  return (
    <SettingsSectionPlaceholder
      title="Lessons"
      description="Learning Queue, Grammar Placement, lesson batch size, and lesson auto-pronunciation."
    />
  );
}
