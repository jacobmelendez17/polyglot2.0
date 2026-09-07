export type AdminNavItem = {
  label: string;
  href: string;
};

const CURRICULUM_ONLY_NAV: AdminNavItem[] = [
  { label: "Curriculum", href: "/admin/curriculum" },
  { label: "Levels", href: "/admin/curriculum/levels" },
  { label: "Groups", href: "/admin/curriculum/groups" },
  // Spec 12 — dictionary mapping review. Curriculum-only, like the three
  // above: it reads and mutates official curriculum mappings, so a developer
  // without the admin role must not see it.
  { label: "Dictionary", href: "/admin/dictionary" },
];

const ADMIN_AREA_NAV: AdminNavItem[] = [
  { label: "Logs", href: "/admin/logs" },
  { label: "Sandbox", href: "/admin/sandbox" },
];

/**
 * Shared nav-item list, used by both `admin-sidebar-nav.tsx` (desktop) and
 * `admin-mobile-nav.tsx` (mobile sheet) so the permission-based item set
 * lives in exactly one place — same reasoning as `LevelLink` being shared
 * between the header dropdown and the mobile sheet in spec 10.
 */
export function getAdminNavItems(canManageCurriculum: boolean): AdminNavItem[] {
  return [{ label: "Overview", href: "/admin" }, ...(canManageCurriculum ? CURRICULUM_ONLY_NAV : []), ...ADMIN_AREA_NAV];
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
