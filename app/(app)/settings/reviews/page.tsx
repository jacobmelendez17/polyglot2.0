import type { Metadata } from "next";

import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";

export const metadata: Metadata = {
  title: "Review Settings — Polyglot",
};

export default function ReviewSettingsPage() {
  return (
    <SettingsSectionPlaceholder
      title="Reviews"
      description="Review types, Ghost Reviews, Leeches, hints, Review UI, SRS Strictness, SRS Interval, Review Queue Timing, and Fluent Mode."
    />
  );
}
