"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { getAdminNavItems, isAdminNavItemCurrent } from "./admin-nav-items";

type AdminSidebarNavProps = {
  canManageCurriculum: boolean;
};

/**
 * Persistent desktop Admin navigation (spec 11 §6), rendered inside the
 * layout's `<aside>`. Curriculum is omitted entirely for a developer-only
 * user rather than shown disabled — real enforcement still
 * happens server-side on every route (`forbidden()` in each page), this is
 * presentation only, per code-standards.md's "hiding UI is never
 * authorization." See `admin-mobile-nav.tsx` for the small-viewport
 * equivalent — desktop is the primary Admin target (spec 11 §74), but
 * mobile must stay navigable, not merely present.
 */
export function AdminSidebarNav({ canManageCurriculum }: AdminSidebarNavProps) {
  const pathname = usePathname();
  const items = getAdminNavItems(canManageCurriculum);

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isAdminNavItemCurrent(item, pathname) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isAdminNavItemCurrent(item, pathname) && "bg-muted font-semibold text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
