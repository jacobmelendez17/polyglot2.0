import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

import { LevelsDropdown } from "@/components/shared/levels-dropdown";

const APP_NAV_LINKS = [
  { label: "Reviews", href: "/reviews" },
  { label: "Decks", href: "/decks" },
  { label: "Practice", href: "/practice" },
  { label: "Journey", href: "/journey" },
] as const;

export function AppHeader() {
  return (
    <header
      className="site-header sticky top-0 z-(--z-header) h-(--nav-h) border-b border-border bg-background/95"
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="font-heading text-lg font-semibold text-foreground">
          Polyglot
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {/* Spec 10 §3/§34: Levels opens a dropdown rather than navigating directly — kept first, matching the existing nav order. */}
            <LevelsDropdown />
            {APP_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <UserButton />
        </div>
      </div>
    </header>
  );
}
