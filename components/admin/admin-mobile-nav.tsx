"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { ExternalLink } from "@/components/admin/external-link";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminExternalLink } from "./admin-external-links";
import {
  getAdminNavItems,
  isAdminNavItemCurrent,
  type AdminNavPermissions,
} from "./admin-nav-items";

type AdminMobileNavProps = {
  /** The person's effective permissions — what the server says they may open (`buildAdminPermissions`). */
  permissions: AdminNavPermissions;
  /** Links out of Polyglot (spec 27 Unit 27.10), already filtered to what this person may see. */
  externalLinks?: readonly AdminExternalLink[];
};

/**
 * Mobile Admin navigation (spec 11 §74): a menu-triggered `Sheet`,
 * mirroring `app-nav-mobile.tsx`'s "More" sheet. Rendered directly in the
 * layout's header (not inside the desktop `<aside>`, which is `hidden`
 * below `sm:` and would hide this trigger too) so it stays reachable at
 * every viewport width the desktop sidebar itself is hidden at. The same
 * links as the sidebar, from the same permissions (spec 26 Unit 11).
 */
export function AdminMobileNav({
  permissions,
  externalLinks = [],
}: AdminMobileNavProps) {
  const pathname = usePathname();
  const items = getAdminNavItems(permissions);

  return (
    <Sheet>
      <SheetTrigger
        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground sm:hidden"
        aria-label="Open Admin navigation"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        Menu
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Admin</SheetTitle>
        </SheetHeader>
        <nav aria-label="Admin" className="flex flex-col gap-1 p-4 pt-0">
          {items.map((item) => (
            <SheetClose asChild key={item.href}>
              <Link
                href={item.href}
                aria-current={
                  isAdminNavItemCurrent(item, pathname, items)
                    ? "page"
                    : undefined
                }
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted",
                  isAdminNavItemCurrent(item, pathname, items) &&
                    "bg-muted font-semibold",
                )}
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
          {externalLinks.map((link) => (
            <ExternalLink
              key={link.href}
              href={link.href}
              className="justify-between rounded-md px-3 py-2 text-sm text-foreground no-underline transition-colors hover:bg-muted"
            >
              {link.label}
            </ExternalLink>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
