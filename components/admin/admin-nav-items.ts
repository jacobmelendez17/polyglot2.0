import type { AdminPermissions } from "@/domains/admin";

export type AdminNavItem = {
  label: string;
  href: string;
};

/**
 * What the navigation reads of a person's effective permissions — the same
 * object `GET /api/v1/admin/me` returns and every React Admin screen asks
 * (`buildAdminPermissions`), so the sidebar and the screens cannot disagree
 * about what someone may open (spec 26 Unit 11). A link is shown when its
 * *resource* is one the server lists for them, or — for the Sandbox, the one
 * page that is not a React Admin resource — when they may use developer tools.
 */
export type AdminNavPermissions = Pick<
  AdminPermissions,
  "resources" | "canUseDeveloperTools"
>;

type NavEntry = AdminNavItem & {
  /** The resource this link opens; shown when the server lists it. Absent for the Sandbox, the one page that is a tool and not a resource. */
  resource?: string;
};

/**
 * Every link, in the order the sidebar shows them. Everything but the Sandbox is
 * a React Admin screen (Logs since 2026-10-14, and it stays: spec 27 keeps audits
 * in Neon); the Sandbox is a retained specialist tool (spec 26 §4).
 * Hiding a link is never authorization — each page and endpoint re-checks.
 */
const NAV: NavEntry[] = [
  { label: "Overview", href: "/admin", resource: "overview" },
  { label: "Curriculum", href: "/admin/curriculum", resource: "curriculum" },
  // Spec 17 — everything a writer has left waiting for Admin verification.
  { label: "Review", href: "/admin/curriculum/review", resource: "review" },
  { label: "Levels", href: "/admin/curriculum/levels", resource: "levels" },
  { label: "Groups", href: "/admin/curriculum/groups", resource: "groups" },
  // Spec 19 §19 — asynchronous curriculum import history — an Admin's end to end
  // (the owner's decision of 2026-10-14: a writer has no Imports). Nested under
  // /admin/curriculum like Levels/Groups above, so isAdminNavItemCurrent's
  // longest-prefix rule highlights this instead of falling back to
  // "Curriculum" on /admin/curriculum/imports and its sub-routes.
  { label: "Imports", href: "/admin/curriculum/imports", resource: "imports" },
  // Spec 12 — dictionary mapping review. A writer authors mappings; a developer
  // without the admin role must not see it.
  { label: "Dictionary", href: "/admin/dictionary", resource: "dictionary" },
  // Spec 14 — official Polyglot decks. A writer may see them (the owner's
  // decision of 2026-10-14); an Admin creates and manages them.
  { label: "Decks", href: "/admin/decks", resource: "decks" },
  // Operational surfaces — Admin and developer, never a writer (spec 17). The
  // audit log is a resource (read-only); the Sandbox is a tool.
  { label: "Logs", href: "/admin/logs", resource: "logs" },
  { label: "Sandbox", href: "/admin/sandbox" },
  // Spec 26 Unit 6 — the account list and role changes. Admin only.
  { label: "Users", href: "/admin/users", resource: "users" },
];

/**
 * Shared nav-item list, used by both `admin-sidebar-nav.tsx` (desktop) and
 * `admin-mobile-nav.tsx` (mobile sheet) so the permission-based item set
 * lives in exactly one place — same reasoning as `LevelLink` being shared
 * between the header dropdown and the mobile sheet in spec 10.
 */
export function getAdminNavItems(
  permissions: AdminNavPermissions,
): AdminNavItem[] {
  return NAV.filter((entry) =>
    entry.resource
      ? Boolean(permissions.resources[entry.resource])
      : permissions.canUseDeveloperTools,
  ).map(({ label, href }) => ({ label, href }));
}

/**
 * `allItems` disambiguates nested routes now that "Levels"/"Groups" nest
 * under "Curriculum"'s own `/admin/curriculum` prefix: on
 * `/admin/curriculum/levels`, both hrefs match by simple prefix, so only
 * the longest (most specific) match — "Levels" — should read as current.
 * `/admin/curriculum/items/...` has no sibling of its own, so it still
 * falls back to "Curriculum" correctly. "Overview"'s `/admin` needs its own
 * exact-match rule regardless, since every other route is prefixed by it.
 */
export function isAdminNavItemCurrent(
  item: AdminNavItem,
  pathname: string,
  allItems: AdminNavItem[] = [item],
): boolean {
  const matches = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);
  if (!matches(item.href)) return false;
  return !allItems.some(
    (other) =>
      other.href !== item.href &&
      other.href.length > item.href.length &&
      matches(other.href),
  );
}
