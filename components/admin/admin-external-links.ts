import type { AdminPermissions } from "@/domains/admin";
import type { OperationalLinks } from "@/lib/operational-links";

export type AdminExternalLink = {
  label: string;
  /** An address from `parseOperationalLinks`: https, on the vendor's own host, nothing else in it. */
  href: string;
};

/**
 * Spec 27 Unit 27.10 — the links out of Polyglot that the Admin menu offers.
 * Today that is one: **Analytics**, to the owner's PostHog dashboards.
 *
 * Kept apart from `getAdminNavItems` on purpose. That list is a function of the
 * server's permissions alone, every entry is a page of this application, and its
 * consistency tests hold it to that. An external link depends on a deployment
 * setting too, leaves the application, and is rendered differently (a new tab,
 * with a warning), so it does not share the list.
 *
 * Offered only to someone who may use developer tools (`canUseDeveloperTools`:
 * Admin and developer, never a writer or a learner) and only when the PostHog
 * address is configured and passed validation; otherwise there is no link, not a
 * disabled one. Hiding a link is never authorization — and this link needs none:
 * PostHog asks for its own sign-in, and the address is not a secret.
 */
export function getAdminExternalLinks(
  permissions: Pick<AdminPermissions, "canUseDeveloperTools">,
  links: Pick<OperationalLinks, "posthog">,
): AdminExternalLink[] {
  if (!permissions.canUseDeveloperTools || !links.posthog) return [];
  return [{ label: "Analytics", href: links.posthog.dashboards }];
}
