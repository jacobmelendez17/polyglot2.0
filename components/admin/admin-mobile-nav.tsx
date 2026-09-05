"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getAdminNavItems, isAdminNavItemCurrent } from "./admin-nav-items";

type AdminMobileNavProps = {
  canManageCurriculum: boolean;
};

/**
 * Mobile Admin navigation (spec 11 §74): a menu-triggered `Sheet`,
 * mirroring `app-nav-mobile.tsx`'s "More" sheet. Rendered directly in the
 * layout's header (not inside the desktop `<aside>`, which is `hidden`
 * below `sm:` and would hide this trigger too) so it stays reachable at
 * every viewport width the desktop sidebar itself is hidden at.
 */
export function AdminMobileNav({ canManageCurriculum }: AdminMobileNavProps) {
  const pathname = usePathname();
  const items = getAdminNavItems(canManageCurriculum);

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
                aria-current={isAdminNavItemCurrent(item, pathname) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted",
                  isAdminNavItemCurrent(item, pathname) && "bg-muted font-semibold",
                )}
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
