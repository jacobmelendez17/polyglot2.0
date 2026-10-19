import type { ReactNode } from "react";

import { ExternalLink } from "@/components/admin/external-link";
import { Card, CardContent } from "@/components/ui/card";
import type {
  OperationalLink,
  OperationalLinks,
  OperationalLinkSetting,
} from "@/lib/operational-links";
import { cn } from "@/lib/utils";

import type { SignalRow, SignalState } from "./system-status";

type SystemStatusPanelProps = {
  signals: SignalRow[];
  links: OperationalLinks;
};

/**
 * Spec 27 Unit 27.10 — the Admin Logs page's System tab: how this server is set
 * up to send telemetry, and where the owner's own dashboards and alerts are.
 *
 * Presentational only (no hooks, no data fetching): the page hands it plain data
 * built from the sanitized telemetry summary and the validated link settings, so
 * it has no way to show a credential, and renders the same for a Server
 * Component and a test. It makes no claim about the other side: whether PostHog
 * or Grafana is receiving anything, or how much of an allowance is left, is only
 * knowable in their own pages, and an in-app counter would be wrong (usage is
 * spread over many short-lived servers) — so the panel says that, and links.
 *
 * State is never colour alone: each badge says On, Off or Blocked.
 *
 * Sentences are in primary text, not `text-muted-foreground`: the light theme's
 * muted text is about 3:1 on a white card, below AA for body-size text, and here
 * the sentences are the content. Hierarchy comes from size and weight instead.
 */
export function SystemStatusPanel({ signals, links }: SystemStatusPanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <Section
        id="system-telemetry"
        title="Telemetry on this server"
        intro="How this server is set up to send data. It can’t see whether PostHog or Grafana is actually receiving anything — their own pages show that."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {signals.map((signal) => (
            <li key={signal.id}>
              <SignalCard signal={signal} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="system-links"
        title="Dashboards and alerts"
        intro="Each link opens in a new tab and asks you to sign in to that service; Polyglot doesn’t share your session with it."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <VendorLinks
            title="Grafana Cloud"
            links={links.grafana?.links ?? null}
            rejected={links.rejected.includes("GRAFANA_STACK_URL")}
            setting="GRAFANA_STACK_URL"
            howToSet="your stack’s address, https://<stack>.grafana.net, with nothing after it"
            what="dashboards, alert rules, email contact points and the uptime check"
          />
          <VendorLinks
            title="PostHog"
            links={links.posthog?.links ?? null}
            rejected={links.rejected.includes("POSTHOG_DASHBOARDS_URL")}
            setting="POSTHOG_DASHBOARDS_URL"
            howToSet="your dashboards page on https://us.posthog.com or https://eu.posthog.com — not a shared, embedded or exported link"
            what="your product dashboards and the billing and usage page"
          />
        </div>
      </Section>

      <Section id="system-health" title="Health checks">
        <p className="text-sm text-foreground">
          <Code>/api/health</Code> says the application is serving, and{" "}
          <Code>/api/health/ready</Code> says it can reach its database. Both
          are public, are never cached, and don’t depend on PostHog or Grafana.
          The uptime check you create in Grafana (steps in{" "}
          <Code>infra/telemetry/README.md</Code>) is meant to call the first
          every five minutes; this page can’t tell whether it exists.
        </p>
      </Section>

      <Section id="system-limits" title="Free-plan limits">
        <p className="text-sm text-foreground">
          Polyglot can’t see how much of the PostHog or Grafana allowance has
          been used: usage is spread across many short-lived servers, so a count
          shown here would be wrong. Check each service’s own usage page every
          week — the steps are under “Watching the quotas” in{" "}
          <Code>infra/telemetry/README.md</Code>.
        </p>
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <div>
        <h2
          id={`${id}-heading`}
          className="text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
        {intro ? <p className="mt-1 text-sm text-foreground">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

const BADGE: Record<SignalState, { box: string; dot: string }> = {
  on: { box: "border-state-success", dot: "bg-state-success" },
  off: { box: "border-border", dot: "bg-muted-foreground" },
  blocked: { box: "border-state-warning", dot: "bg-state-warning" },
};

function SignalCard({ signal }: { signal: SignalRow }) {
  const badge = BADGE[signal.state];
  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">
            {signal.title}{" "}
            <span className="font-normal text-foreground">
              · {signal.vendor}
            </span>
          </h3>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground",
              badge.box,
            )}
          >
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", badge.dot)}
            />
            {signal.stateLabel}
          </span>
        </div>
        <p className="text-sm text-foreground">{signal.summary}</p>
        {signal.reasons.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
            {signal.reasons.map((reason) => (
              <li key={`${reason.setting}-${reason.message}`}>
                <Code>{reason.setting}</Code> {reason.message}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-foreground">
          Switch: <Code>{signal.switchName}</Code>
        </p>
      </CardContent>
    </Card>
  );
}

function VendorLinks({
  title,
  links,
  rejected,
  setting,
  howToSet,
  what,
}: {
  title: string;
  links: readonly OperationalLink[] | null;
  rejected: boolean;
  setting: OperationalLinkSetting;
  howToSet: string;
  what: string;
}) {
  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {links ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {links.map((link) => (
              <li key={link.url}>
                <ExternalLink href={link.url}>{link.label}</ExternalLink>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground">
            {rejected ? (
              <>
                <Code>{setting}</Code> is set, but it isn’t an address this page
                will link to, so its links are hidden. It must be {howToSet}.
              </>
            ) : (
              <>
                No link yet. Set <Code>{setting}</Code> to {howToSet} to add
                links to {what}.
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A setting or a path: monospace, and allowed to break anywhere so a long name cannot push the page sideways on a phone. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] [overflow-wrap:anywhere] text-foreground">
      {children}
    </code>
  );
}
