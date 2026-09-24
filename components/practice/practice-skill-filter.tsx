import Link from "next/link";
import { Trees } from "lucide-react";

import type {
  PracticeGroveView,
  PracticeSkillFilter,
} from "@/domains/practice";
import { cn } from "@/lib/utils";

type PracticeSkillFilterProps = {
  groves: readonly PracticeGroveView[];
  active: PracticeSkillFilter;
};

const SIGN_CLASSES =
  "practice-sketch flex items-center gap-2 rounded-[6px_14px_14px_6px] bg-secondary px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:text-background";

/**
 * Signpost filter. The filter is URL state (`?skill=`), so the server does
 * the filtering and this is plain links — shareable, back-button friendly,
 * and working with JavaScript disabled. `aria-current` carries the selected
 * state, so it is never color alone.
 */
export function PracticeSkillFilterNav({
  groves,
  active,
}: PracticeSkillFilterProps) {
  return (
    <nav aria-label="Filter by skill" className="flex flex-wrap gap-2.5">
      <Link
        href="/practice"
        scroll={false}
        aria-current={active === "all" ? "page" : undefined}
        className={SIGN_CLASSES}
      >
        <Trees className="h-4 w-4" aria-hidden="true" />
        All
      </Link>
      {groves.map((grove) => (
        <Link
          key={grove.skill}
          href={`/practice?skill=${grove.skill}`}
          scroll={false}
          aria-current={active === grove.skill ? "page" : undefined}
          data-practice-tone={grove.skill}
          className={SIGN_CLASSES}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--c)"
            aria-hidden="true"
          />
          {grove.label}
          <span
            className={cn("text-xs opacity-70")}
            aria-label={`${grove.practices.length} ${grove.practices.length === 1 ? "practice" : "practices"}`}
          >
            {grove.practices.length}
          </span>
        </Link>
      ))}
    </nav>
  );
}
