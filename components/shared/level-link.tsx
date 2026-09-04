import Link from "next/link";

import { cn } from "@/lib/utils";

type LevelLinkProps = {
  levelNumber: number;
  isCurrent: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * One level-number link, shared between the header dropdown
 * (`levels-dropdown.tsx`) and the page-level 1-50 selector
 * (`components/levels/level-selector.tsx`) so the current-level treatment
 * and accessible semantics live in exactly one place (spec 10 §7/§31).
 * Current state is communicated with a border, background, and font-weight
 * together — never color alone — plus `aria-current="page"` for assistive
 * tech.
 */
export function LevelLink({ levelNumber, isCurrent, onClick, className }: LevelLinkProps) {
  return (
    <Link
      href={`/levels/${levelNumber}`}
      onClick={onClick}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "flex items-center justify-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isCurrent && "border border-foreground/50 bg-muted font-semibold text-foreground",
        className,
      )}
    >
      {levelNumber}
    </Link>
  );
}
