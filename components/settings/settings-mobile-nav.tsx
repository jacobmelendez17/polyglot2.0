"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  SETTINGS_NAV_ITEMS,
  isSettingsNavItemCurrent,
} from "./settings-nav-items";

/**
 * Mobile Settings navigation (spec 20 "Layout": "do not squeeze the desktop
 * sidebar into a narrow column... recompose it into a Settings navigation
 * control/sheet/dropdown"). Mirrors `admin-mobile-nav.tsx`'s pattern.
 */
export function SettingsMobileNav() {
  const pathname = usePathname();

  return (
    <Sheet>
      <SheetTrigger
        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground sm:hidden"
        aria-label="Open Settings navigation"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        Sections
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>
        <nav aria-label="Settings" className="flex flex-col gap-1 p-4 pt-0">
          {SETTINGS_NAV_ITEMS.map((item) => {
            const isCurrent = isSettingsNavItemCurrent(item, pathname);
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                    item.destructive
                      ? "mt-4 border-t border-border pt-4 text-destructive"
                      : "text-foreground",
                    isCurrent && "bg-muted font-semibold",
                  )}
                >
                  {item.label}
                </Link>
              </SheetClose>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
