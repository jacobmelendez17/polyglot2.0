export type SettingsNavItem = {
  label: string;
  href: string;
  /** Danger Zone renders with destructive styling wherever this list is used (spec 20's "appears visually separate"). */
  destructive?: boolean;
};

/**
 * Shared nav-item list for the Settings shell (spec 20 "Routes"/"Layout"),
 * used by both `settings-sidebar-nav.tsx` (desktop) and
 * `settings-mobile-nav.tsx` (mobile sheet) so the section list lives in
 * exactly one place — same reasoning as `getAdminNavItems`. Unlike Admin,
 * every item is visible to every authenticated user: Settings has no
 * role-gated sections.
 */
export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: "Account", href: "/settings/account" },
  { label: "General", href: "/settings/general" },
  { label: "Lessons", href: "/settings/lessons" },
  { label: "Reviews", href: "/settings/reviews" },
  { label: "Appearance", href: "/settings/appearance" },
  { label: "Subscription", href: "/settings/subscription" },
  { label: "Notifications", href: "/settings/notifications" },
  { label: "API", href: "/settings/api" },
  { label: "Danger Zone", href: "/settings/danger", destructive: true },
];

/** None of the Settings routes nest under one another, so a simple exact/prefix match is enough — no sibling-prefix disambiguation like Admin's Curriculum/Levels needs. */
export function isSettingsNavItemCurrent(
  item: SettingsNavItem,
  pathname: string,
): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
