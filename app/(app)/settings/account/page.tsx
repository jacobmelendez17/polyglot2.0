import type { Metadata } from "next";

import { NameField } from "@/components/settings/account/name-field";
import { SettingsSectionPlaceholder } from "@/components/settings/settings-section-placeholder";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Account Settings — Polyglot",
};

export default async function AccountSettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Personal Information</h2>
        <div className="mt-2">
          <NameField initialName={user.displayName} />
        </div>
      </div>
      <SettingsSectionPlaceholder
        title="More Account settings"
        description="Username, email, password, Beta, and the onboarding tour replay."
      />
    </div>
  );
}
