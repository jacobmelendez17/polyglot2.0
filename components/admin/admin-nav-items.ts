export type AdminNavItem = {
  label: string;
  href: string;
};

const CURRICULUM_ONLY_NAV: AdminNavItem[] = [
  { label: "Curriculum", href: "/admin/curriculum" },
  // Spec 17 — everything a writer has left waiting for Admin verification.
  { label: "Review", href: "/admin/curriculum/review" },
  { label: "Levels", href: "/admin/curriculum/levels" },
  { label: "Groups", href: "/admin/curriculum/groups" },
  // Spec 19 §19 — asynchronous curriculum import history. Nested under
  // /admin/curriculum like Levels/Groups above, so isAdminNavItemCurrent's
  // longest-prefix rule highlights this instead of falling back to
  // "Curriculum" on /admin/curriculum/imports and its sub-routes.
  { label: "Imports", href: "/admin/curriculum/imports" },
  // Spec 12 — dictionary mapping review. Curriculum-only, like the three
  // above: it reads and mutates official curriculum mappings, so a developer
  // without the admin role must not see it.
  { label: "Dictionary", href: "/admin/dictionary" },
  // Spec 14 — official Polyglot decks reference published curriculum and are
  // official content, so they sit with the other curriculum-only items: a
  // developer without the admin role must not see or reach this.
  { label: "Decks", href: "/admin/decks" },
];

/** Operational surfaces — Admin and developer, never a writer (spec 17). */
const DEVELOPER_TOOLS_NAV: AdminNavItem[] = [
  { label: "Logs", href: "/admin/logs" },
  { label: "Sandbox", href: "/admin/sandbox" },
];

/**
 * Shared nav-item list, used by both `admin-sidebar-nav.tsx` (desktop) and
 * `admin-mobile-nav.tsx` (mobile sheet) so the permission-based item set
 * lives in exactly one place — same reasoning as `LevelLink` being shared
 * between the header dropdown and the mobile sheet in spec 10.
 */
export function getAdminNavItems(canManageCurriculum: boolean, canUseDeveloperTools = true): AdminNavItem[] {
  return [
    { label: "Overview", href: "/admin" },
    ...(canManageCurriculum ? CURRICULUM_ONLY_NAV : []),
    ...(canUseDeveloperTools ? DEVELOPER_TOOLS_NAV : []),
  ];
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
export function isAdminNavItemCurrent(item: AdminNavItem, pathname: string, allItems: AdminNavItem[] = [item]): boolean {
  const matches = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  if (!matches(item.href)) return false;
  return !allItems.some((other) => other.href !== item.href && other.href.length > item.href.length && matches(other.href));
}
