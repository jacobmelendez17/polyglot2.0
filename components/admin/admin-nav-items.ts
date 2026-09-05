export type AdminNavItem = {
  label: string;
  href: string;
};

const CURRICULUM_ONLY_NAV: AdminNavItem[] = [{ label: "Curriculum", href: "/admin/curriculum" }];

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

export function isAdminNavItemCurrent(item: AdminNavItem, pathname: string): boolean {
  return item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
}
