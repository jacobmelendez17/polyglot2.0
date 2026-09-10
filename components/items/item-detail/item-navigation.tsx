import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { ItemNavigationView } from "@/domains/curriculum";
import { cn } from "@/lib/utils";

type ItemNavigationProps = {
  navigation: ItemNavigationView;
  direction: "previous" | "next";
  /**
   * Where an arrow goes. The item page links to another item route; a lesson
   * moves within its own session and has no URL to link to, so it passes a
   * handler instead (spec 18: lesson navigation must not escape the session).
   */
  hrefForItem?: (itemId: string) => string;
  onNavigate?: (itemId: string) => void;
  className?: string;
};

/**
 * One of the hero's large, minimal previous/next arrows.
 *
 * Renders a `Link` when the destination is a real route and a `button` when
 * it is a move inside a lesson session. The two behave and look identically
 * to a learner; the distinction exists so a lesson can never produce a URL
 * that would take the learner out of the session.
 */
export function ItemNavigation({ navigation, direction, hrefForItem, onNavigate, className }: ItemNavigationProps) {
  const targetId = direction === "previous" ? navigation.previousItemId : navigation.nextItemId;
  const label = `${direction === "previous" ? "Previous" : "Next"} item in ${navigation.scopeLabel}`;

  const classes = cn(
    "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors sm:h-14 sm:w-14",
    "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    className,
  );

  const icon =
    direction === "previous" ? (
      <ChevronLeft className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden="true" />
    ) : (
      <ChevronRight className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden="true" />
    );

  if (hrefForItem) {
    return (
      <Link href={hrefForItem(targetId)} aria-label={label} className={classes}>
        {icon}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onNavigate?.(targetId)} aria-label={label} className={classes}>
      {icon}
    </button>
  );
}
