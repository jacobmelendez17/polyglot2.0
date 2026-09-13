import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Spec 20 Account — Tours. "Onboarding Tour" reuses the existing onboarding
 * slideshow's replay mode (`/onboarding?replay=1`, spec 15) rather than a
 * second implementation — `returnTo=settings` is what sends the preview
 * back here instead of the Sandbox's own default. Replay writes nothing:
 * onboarding completion, curriculum preference, progress, SRS, and language
 * selection are all untouched, enforced server-side regardless of what a
 * client requests (see `app/(onboarding)/onboarding/actions.ts`).
 *
 * "Dashboard Tour" is intentionally omitted — spec 20: "do not show the
 * Dashboard Tour control until a real Dashboard Tour exists."
 */
export function ToursSection() {
  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <p className="text-sm font-medium text-foreground">Onboarding Tour</p>
      <p className="mt-1 text-sm text-muted-foreground">Replay Polyglot&apos;s introduction.</p>
      <Button asChild type="button" variant="outline" size="sm" className="mt-3">
        <Link href="/onboarding?replay=1&returnTo=settings">Replay</Link>
      </Button>
    </div>
  );
}
