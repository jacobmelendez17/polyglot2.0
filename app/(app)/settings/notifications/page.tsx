import type { Metadata } from "next";

import { InactivityEmailToggle } from "@/components/settings/notifications/inactivity-email-toggle";
import { NewsUpdatesToggle } from "@/components/settings/notifications/news-updates-toggle";
import { ProgressEmailToggle } from "@/components/settings/notifications/progress-email-toggle";
import { TrialEmailsToggle } from "@/components/settings/notifications/trial-emails-toggle";
import { getEffectiveNotificationPreferences, requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Notification Settings — Polyglot",
};

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const preferences = await getEffectiveNotificationPreferences(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Email</h2>
        <div className="mt-2">
          <NewsUpdatesToggle initialValue={preferences.newsUpdates} />
          <ProgressEmailToggle initialValue={preferences.progressEmail} />
          <InactivityEmailToggle initialValue={preferences.inactivityEmail} />
          <TrialEmailsToggle initialValue={preferences.trialEmail} />
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">Transactional Emails</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Account-security, email/password changes, billing, subscription, and other required transactional messages cannot be
            disabled.
          </p>
        </div>
      </div>
    </div>
  );
}
