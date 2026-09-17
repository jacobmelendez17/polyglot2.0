"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  SETTINGS_NAV_ITEMS,
  isSettingsNavItemCurrent,
} from "./settings-nav-items";

/**
 * Persistent desktop Settings navigation (spec 20 "Layout"), rendered
 * inside the layout's `<aside>`. See `settings-mobile-nav.tsx` for the
 * small-viewport equivalent.
 */
export function SettingsSidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="flex flex-col gap-1 p-3">
      {SETTINGS_NAV_ITEMS.map((item) => {
        const isCurrent = isSettingsNavItemCurrent(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              item.destructive
                ? "mt-4 border-t border-border pt-4 text-destructive hover:text-destructive"
                : "text-muted-foreground hover:text-foreground",
              isCurrent &&
                (item.destructive
                  ? "bg-muted font-semibold"
                  : "bg-muted font-semibold text-foreground"),
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
