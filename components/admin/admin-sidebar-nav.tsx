"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ExternalLink } from "@/components/admin/external-link";
import { cn } from "@/lib/utils";
import type { AdminExternalLink } from "./admin-external-links";
import {
  getAdminNavItems,
  isAdminNavItemCurrent,
  type AdminNavPermissions,
} from "./admin-nav-items";

type AdminSidebarNavProps = {
  /** The person's effective permissions — what the server says they may open (`buildAdminPermissions`). */
  permissions: AdminNavPermissions;
  /** Links out of Polyglot (spec 27 Unit 27.10), already filtered to what this person may see. */
  externalLinks?: readonly AdminExternalLink[];
};

/**
 * Persistent desktop Admin navigation (spec 11 §6), rendered inside the
 * layout's `<aside>`. A link is shown only for what the server's effective
 * permissions list for this person — the same ones the React Admin screens use
 * (spec 26 Unit 11) — rather than shown disabled: real enforcement still
 * happens server-side on every route (`forbidden()` in each page), this is
 * presentation only, per code-standards.md's "hiding UI is never
 * authorization." See `admin-mobile-nav.tsx` for the small-viewport
 * equivalent — desktop is the primary Admin target (spec 11 §74), but
 * mobile must stay navigable, not merely present.
 */
export function AdminSidebarNav({
  permissions,
  externalLinks = [],
}: AdminSidebarNavProps) {
  const pathname = usePathname();
  const items = getAdminNavItems(permissions);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            isAdminNavItemCurrent(item, pathname, items) ? "page" : undefined
          }
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isAdminNavItemCurrent(item, pathname, items) &&
              "bg-muted font-semibold text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
      {externalLinks.map((link) => (
        <ExternalLink
          key={link.href}
          href={link.href}
          className="justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
        >
          {link.label}
        </ExternalLink>
      ))}
    </nav>
  );
}
