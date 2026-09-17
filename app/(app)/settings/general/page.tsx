import type { Metadata } from "next";

import { HideEnglishToggle } from "@/components/settings/general/hide-english-toggle";
import { NsfwContentToggle } from "@/components/settings/general/nsfw-content-toggle";
import { TimezoneSelect } from "@/components/settings/general/timezone-select";
import { VacationModeToggle } from "@/components/settings/general/vacation-mode-toggle";
import {
  getEffectiveContentPreferences,
  isVacationModeActive,
  requireUser,
} from "@/domains/users/server";

export const metadata: Metadata = {
  title: "General Settings — Polyglot",
};

export default async function GeneralSettingsPage() {
  const user = await requireUser();
  const [contentPreferences, vacationModeActive] = await Promise.all([
    getEffectiveContentPreferences(user.id),
    isVacationModeActive(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Time &amp; Date
        </h2>
        <div className="mt-2">
          <TimezoneSelect initialTimezone={user.timezone} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Content
        </h2>
        <div className="mt-2">
          <HideEnglishToggle
            initialValue={contentPreferences.hideEnglishReviews}
          />
          <NsfwContentToggle
            initialValue={contentPreferences.showNsfwContent}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Vacation
        </h2>
        <div className="mt-2">
          <VacationModeToggle initialValue={vacationModeActive} />
        </div>
      </div>
    </div>
  );
}
