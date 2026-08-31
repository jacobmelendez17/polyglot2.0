"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, RotateCcw, Dumbbell, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const PRIMARY_TABS = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Learn", href: "/levels", icon: BookOpen },
  { label: "Reviews", href: "/reviews", icon: RotateCcw },
  { label: "Practice", href: "/practice", icon: Dumbbell },
] as const;

const MORE_LINKS = [
  { label: "Decks", href: "/decks" },
  { label: "Journey", href: "/journey" },
] as const;

export function AppNavMobile() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-(--z-header) border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-between px-2">
        {PRIMARY_TABS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <nav aria-label="More" className="flex flex-col gap-1 p-4 pt-0">
              {MORE_LINKS.map((link) => (
                <SheetClose asChild key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
