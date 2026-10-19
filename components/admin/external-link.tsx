import type { ReactNode } from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ExternalLinkProps = {
  /** An address that has already been through `lib/operational-links.ts`; this component trusts nothing else. */
  href: string;
  children: ReactNode;
  className?: string;
};

/**
 * Spec 27 Unit 27.10 — the one way the Admin console links out of Polyglot.
 *
 * It opens in a new tab with `noopener noreferrer`, so the other site gets no
 * handle on this window and is not told which admin page the click came from;
 * it carries an icon, and says "opens in a new tab" to a screen reader, because a
 * link that leaves the application should never be a surprise. It renders
 * nothing special for the address: the caller must pass one that came from the
 * validated settings (`parseOperationalLinks`), never one built from input.
 *
 * No hooks and no browser APIs, so a Server Component and a Client Component can
 * both render it.
 */
export function ExternalLink({ href, children, className }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline underline-offset-4 hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {/* The label and the warning share one run of text, with a real space
          between them: as separate flex items they would be spoken as one word
          wherever the browser does not add the gap itself. */}
      <span>
        {children} <span className="sr-only">(opens in a new tab)</span>
      </span>
      <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}
