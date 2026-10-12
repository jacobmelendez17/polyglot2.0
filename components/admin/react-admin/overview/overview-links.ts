import type { AdminPermissions } from "@/domains/admin";

export type OverviewLink = {
  label: string;
  href: string;
  description: string;
};

type PermissionKey = keyof Pick<
  AdminPermissions,
  "canManageCurriculum" | "canUseDeveloperTools"
>;

/**
 * Each shortcut names the *server-provided* permission it needs. The browser
 * never decides which role may see what — it only asks the permissions
 * object `GET /api/v1/admin/me` returned. This matches the nav's own rule
 * (`admin-nav-items.ts`): Curriculum is for anyone who can manage it; Logs and
 * Sandbox are developer tools, which a writer does not have (spec 17).
 */
const LINKS: ReadonlyArray<OverviewLink & { requires: PermissionKey }> = [
  {
    label: "Curriculum",
    href: "/admin/curriculum",
    description: "Browse and manage official curriculum.",
    requires: "canManageCurriculum",
  },
  {
    label: "Logs",
    href: "/admin/logs",
    description: "Review administrative and system activity.",
    requires: "canUseDeveloperTools",
  },
  {
    label: "Sandbox",
    href: "/admin/sandbox",
    description: "Test learning behavior in an isolated environment.",
    requires: "canUseDeveloperTools",
  },
];

export function getOverviewLinks(
  permissions: Pick<AdminPermissions, PermissionKey>,
): OverviewLink[] {
  return LINKS.filter((link) => permissions[link.requires]).map(
    ({ label, href, description }) => ({ label, href, description }),
  );
}
