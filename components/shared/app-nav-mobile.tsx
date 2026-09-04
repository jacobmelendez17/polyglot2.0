"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, RotateCcw, Dumbbell, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { LevelLink } from "@/components/shared/level-link";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LEVEL_NUMBER_MAX, LEVEL_NUMBER_MIN } from "@/domains/curriculum";

const LEVEL_NUMBERS = Array.from({ length: LEVEL_NUMBER_MAX - LEVEL_NUMBER_MIN + 1 }, (_, i) => i + LEVEL_NUMBER_MIN);

const PRIMARY_TABS = [
  { label: "Reviews", href: "/reviews", icon: RotateCcw },
  { label: "Practice", href: "/practice", icon: Dumbbell },
] as const;

const MORE_LINKS = [
  { label: "Decks", href: "/decks" },
  { label: "Journey", href: "/journey" },
] as const;

function getCurrentLevelFromPathname(pathname: string): number | null {
  const match = /^\/levels\/(\d+)$/.exec(pathname);
  return match ? Number(match[1]) : null;
}

export function AppNavMobile() {
  const pathname = usePathname();
  const isOnLevels = pathname.startsWith("/levels");
  const currentLevel = getCurrentLevelFromPathname(pathname);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-(--z-header) border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-between px-2">
        <Link
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors",
            pathname === "/dashboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Home className="h-5 w-5" aria-hidden="true" />
          Home
        </Link>

        {/* Spec 10 §4 Mobile: same Levels 1-50 navigation as desktop, in a bottom sheet rather than the desktop 10-column grid so touch targets stay usable. */}
        <Sheet>
          <SheetTrigger
            className={cn(
              "flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium transition-colors",
              isOnLevels ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            Learn
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Levels</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-5 gap-2 p-4 pt-0 sm:grid-cols-8">
              {LEVEL_NUMBERS.map((levelNumber) => (
                <SheetClose asChild key={levelNumber}>
                  <LevelLink levelNumber={levelNumber} isCurrent={levelNumber === currentLevel} className="h-11 w-full" />
                </SheetClose>
              ))}
            </div>
          </SheetContent>
        </Sheet>

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
          <SheetTrigger
            className="flex flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            More
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
