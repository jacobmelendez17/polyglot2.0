import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Settings — Polyglot",
};

/**
 * Spec 20 "API": final content, not a stub — "Coming Soon" only, with no
 * API keys/secrets/scopes/usage tables until a real public API exists.
 */
export default function ApiSettingsPage() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-heading text-lg font-semibold text-foreground">
        API
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">Coming Soon</p>
    </div>
  );
}
