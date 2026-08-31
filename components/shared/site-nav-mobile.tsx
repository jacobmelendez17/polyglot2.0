"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const MOBILE_LINKS = [
  { label: "About", href: "/about" },
  { label: "Demo", href: "/demo" },
] as const;

export function SiteNavMobile() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="md:hidden"
        >
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="top"
        className="mobile-nav-sheet data-[side=top]:top-[var(--nav-h)] duration-[var(--dur-base)]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 p-4">
          {MOBILE_LINKS.map((link) => (
            <SheetClose asChild key={link.href}>
              <Link
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
          <Show when="signed-out">
            <SignInButton forceRedirectUrl="/dashboard">
              <button className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                Log in
              </button>
            </SignInButton>
            <SignUpButton forceRedirectUrl="/dashboard">
              <button className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <div className="flex items-center gap-2 px-3 py-2">
              <UserButton />
              <span className="text-sm font-medium text-foreground">Account</span>
            </div>
          </Show>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
