import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { getAnalyticsConsent } from "@/domains/analytics/server";
import { AnalyticsConsentField } from "@/components/settings/privacy/analytics-consent-field";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Privacy Settings — Polyglot",
};

/**
 * Spec 27 Unit 27.2 — Settings → Privacy. Server-rendered from the stored choice,
 * so a device that has never been used before shows what the server holds, and
 * nothing here is read from browser storage.
 *
 * The wording below is what `ANALYTICS_POLICY_VERSION` versions: change what it
 * promises and that constant has to move with it.
 */
export default async function PrivacySettingsPage() {
  const user = await requireUser();
  const consent = await getAnalyticsConsent(user.id);

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="usage-analytics-heading"
        className="rounded-xl border border-border bg-card p-6"
      >
        <h2
          id="usage-analytics-heading"
          className="font-heading text-lg font-semibold text-foreground"
        >
          Usage analytics
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Polyglot can count how its features get used, so we can see what helps
          people learn and what gets in the way. It is off unless you turn it
          on, and your lessons, reviews and progress work exactly the same
          either way.
        </p>

        {consent.needsReview && (
          <p
            role="status"
            className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              The wording on this page changed after you last chose, so your
              earlier choice no longer counts. Please choose again.
            </span>
          </p>
        )}

        <div className="mt-4">
          {user.isSandbox ? (
            <p className="text-sm text-muted-foreground">
              You are viewing Polyglot as a sandbox persona. Usage analytics are
              never collected for sandbox personas, so there is nothing to
              choose here.
            </p>
          ) : (
            <AnalyticsConsentField
              initialAccepted={consent.status === "accepted"}
              initialRevision={consent.revision}
            />
          )}
        </div>

        <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-medium text-foreground">
              If you turn this on, we may record
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                That you finished a lesson, a review or a practice, or unlocked
                a level
              </li>
              <li>
                Simple numbers about it: your level, how many items, how long it
                took, and your accuracy as a percentage
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-foreground">We never record</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Your answers, journal entries, notes or recordings</li>
              <li>Your name or email address</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>
            Events are filed under a random ID that is not your name, email or
            account number, and are sent to PostHog, a product-analytics
            service. This is separate from sign-in and from your learning data,
            which stay in your Polyglot account.
          </p>
          <p>
            Turning this off stops new events straight away, on every device.
            Events already sent are not deleted automatically. When you delete
            your Polyglot account, the random ID is deleted with it, which ends
            the link between you and anything sent under it.
          </p>
          <p>
            More in the{" "}
            <Link
              href="/privacy"
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              privacy notice
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
