import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription — Polyglot",
};

/**
 * Spec 20 "Subscription": final content, not a stub — "Coming Soon" only,
 * with no fake plan/renewal/trial/usage/billing data and no Stripe-specific
 * schema, until a real subscription system exists.
 */
export default function SubscriptionSettingsPage() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-heading text-lg font-semibold text-foreground">Subscription</h2>
      <p className="mt-2 text-sm text-muted-foreground">Coming Soon</p>
    </div>
  );
}
