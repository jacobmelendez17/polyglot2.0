import type { Metadata } from "next";

import { HideEnglishToggle } from "@/components/settings/general/hide-english-toggle";
import { NsfwContentToggle } from "@/components/settings/general/nsfw-content-toggle";
import { TimezoneSelect } from "@/components/settings/general/timezone-select";
import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";
import { getEffectiveContentPreferences, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "General Settings — Polyglot",
};

export default async function GeneralSettingsPage() {
  const user = await requireUser();
  const contentPreferences = await getEffectiveContentPreferences(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Time &amp; Date</h2>
        <div className="mt-2">
          <TimezoneSelect initialTimezone={user.timezone} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Content</h2>
        <div className="mt-2">
          <HideEnglishToggle initialValue={contentPreferences.hideEnglishReviews} />
          <NsfwContentToggle initialValue={contentPreferences.showNsfwContent} />
        </div>
      </div>

      <SettingsSectionPlaceholder title="More General settings" description="Vacation Mode." />
    </div>
  );
}
