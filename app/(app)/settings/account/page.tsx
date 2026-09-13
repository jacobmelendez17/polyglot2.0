import type { Metadata } from "next";

import { EmailField } from "@/components/settings/account/email-field";
import { NameField } from "@/components/settings/account/name-field";
import { PasswordField } from "@/components/settings/account/password-field";
import { ToursSection } from "@/components/settings/account/tours-section";
import { UsernameField } from "@/components/settings/account/username-field";
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
          <UsernameField initialUsername={user.username} />
          <EmailField />
          <PasswordField />
        </div>
      </div>

      {/* Spec 20 Beta: "Coming Soon" only — no fake toggle, no backend field for it. */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Beta Mode</h2>
        <p className="mt-2 text-sm text-muted-foreground">Coming Soon</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Tours</h2>
        <div className="mt-2">
          <ToursSection />
        </div>
        {/* Dashboard Tour is intentionally omitted — spec 20: no control until a real Dashboard Tour exists. */}
      </div>
    </div>
  );
}
