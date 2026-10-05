import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { SkipLink } from "@/components/shared/skip-link";
import { SiteNavMobile } from "@/components/shared/site-nav-mobile";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Demo", href: "/demo" },
] as const;

const NAV_LINK_CLASS =
  "text-sm font-medium text-header-foreground/75 transition-colors hover:text-header-foreground";

export function SiteHeader() {
  return (
    <>
      <SkipLink />
      <header className="sticky top-0 z-(--z-header) h-(--nav-h) w-full border-b border-transparent bg-header-accent">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="font-heading text-lg font-semibold text-header-foreground"
          >
            Polyglot
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <nav
              aria-label="Primary"
              className="hidden items-center gap-6 md:flex"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={NAV_LINK_CLASS}
                >
                  {link.label}
                </Link>
              ))}
              <Show when="signed-out">
                <SignInButton forceRedirectUrl="/dashboard">
                  <button className={NAV_LINK_CLASS}>Log in</button>
                </SignInButton>
              </Show>
            </nav>

            <Show when="signed-out">
              <SignUpButton forceRedirectUrl="/dashboard">
                {/* Inverted (header-foreground fill, header-accent text): the default primary green is too close to the header's own green to read as a button. */}
                <Button className="rounded-full bg-header-foreground text-header-accent hover:bg-header-foreground/90">
                  Sign up
                </Button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>

            <SiteNavMobile />
          </div>
        </div>
      </header>
    </>
  );
}
