"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type LevelContentSectionProps = {
  title: string;
  /** A short byline under the title — spec 26's "12 words · 5 waiting in lessons". */
  subtitle?: string;
  /** Right-aligned content beside the title — spec 26's "7 of 12 at Familiar+". */
  trailing?: ReactNode;
  children: ReactNode;
};

/**
 * Grammar/Vocabulary/Lesson collapsible section (spec 10 §9-§10, spec 26
 * reuses it per-lesson). Expanded by default; the section title stays
 * visible when collapsed. Radix's `Collapsible` supplies real
 * `aria-expanded` and keyboard behavior on the trigger for free.
 */
export function LevelContentSection({
  title,
  subtitle,
  trailing,
  children,
}: LevelContentSectionProps) {
  return (
    <Collapsible defaultOpen className="flex flex-col gap-4">
      <CollapsibleTrigger className="group/section-trigger flex w-full items-center justify-between gap-2 border-b border-border pb-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]/section-trigger:-rotate-90"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {trailing ? (
          <span className="shrink-0 text-sm text-muted-foreground">
            {trailing}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
