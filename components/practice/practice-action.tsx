import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type PracticeActionProps = {
  /** Null until the destination route ships, which renders a disabled "Coming soon" control. */
  href: string | null;
  children: ReactNode;
  variant?: "default" | "outline";
  className?: string;
};

/**
 * The hub's one way to render a "go somewhere" button. Centralizing the
 * unbuilt-route case here is what keeps every card from linking to a 404:
 * shipping a practice only flips its catalog `href`, and every action for it
 * lights up together.
 */
export function PracticeAction({
  href,
  children,
  variant = "default",
  className,
}: PracticeActionProps) {
  if (href === null) {
    return (
      <Button variant="outline" size="sm" disabled className={className}>
        Coming soon
      </Button>
    );
  }

  return (
    <Button asChild variant={variant} size="sm" className={className}>
      <Link href={href}>
        {children}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </Button>
  );
}
