import Link from "next/link";
import { Languages } from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE, APP_VERSION_LABEL } from "@/lib/app-info";

type FooterLink = { label: string; href: string };

/**
 * Levels has no `/levels` index (only `/levels/[level]`) — the header's
 * Levels control is a 50-item dropdown, which doesn't fit a footer link.
 * Level 1 is the one destination every learner can actually reach.
 */
const PRODUCT_LINKS: readonly FooterLink[] = [
  { label: "Levels", href: "/levels/1" },
  { label: "Decks", href: "/decks" },
  { label: "Reviews", href: "/reviews" },
];

// Practice and Journey are deliberately omitted — neither route exists yet
// (see progress-tracker.md). Spec 21 requires links only to routes that
// actually resolve.
const RESOURCE_LINKS: readonly FooterLink[] = [
  { label: "About", href: "/about" },
  { label: "Feedback", href: "/feedback" },
];

// Demo is omitted for the same reason — /demo doesn't exist yet.

const LEGAL_LINKS: readonly FooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

export function Footer({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className={cn("border-t border-border bg-background", className)}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 sm:gap-8">
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground"
            >
              <Languages aria-hidden="true" className="h-5 w-5 text-primary" />
              {APP_NAME}
            </Link>
            <p className="mt-2 max-w-[22ch] text-sm text-muted-foreground">{APP_TAGLINE}</p>
          </div>

          <FooterNavColumn title="Product" links={PRODUCT_LINKS} />
          <FooterNavColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterNavColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        <div className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          <p>
            &copy; {year} {APP_NAME} &middot; {APP_VERSION_LABEL}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterNavColumn({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
