import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SkipLink } from "@/components/shared/skip-link";
import { SiteHeaderScroll } from "@/components/shared/site-header-scroll";
import { SiteNavMobile } from "@/components/shared/site-nav-mobile";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Demo", href: "/demo" },
] as const;

export function SiteHeader() {
  return (
    <>
      <SkipLink />
      <SiteHeaderScroll>
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="font-heading text-lg font-semibold text-foreground">
            Polyglot
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/sign-in"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Log in
              </Link>
            </nav>

            <Button asChild className="rounded-full">
              <Link href="/sign-up">Sign up</Link>
            </Button>

            <SiteNavMobile />
          </div>
        </div>
      </SiteHeaderScroll>
    </>
  );
}
