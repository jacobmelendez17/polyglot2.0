import Link from "next/link";
import { Show } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LandingCtaProps = {
  className?: string;
};

/** Primary marketing call-to-action, shared by the hero and closing sections.
 * Signed-out visitors get "Sign up" and "Try the demo"; a signed-in visitor
 * who has navigated back to the landing page already has an account, so
 * neither applies — one "Go to dashboard" button replaces both. */
export function LandingCta({ className }: LandingCtaProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 sm:flex-row", className)}>
      <Show when="signed-in">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </Show>
      <Show when="signed-out">
        <Button asChild size="lg" className="rounded-full">
          <Link href="/sign-up">Sign up</Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/demo">Try the demo</Link>
        </Button>
      </Show>
    </div>
  );
}
