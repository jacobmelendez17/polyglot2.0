"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type LevelContentSectionProps = {
  title: string;
  children: ReactNode;
};

/**
 * Grammar/Vocabulary collapsible section (spec 10 §9-§10). Expanded by
 * default; the section title stays visible when collapsed. Radix's
 * `Collapsible` supplies real `aria-expanded` and keyboard behavior on the
 * trigger for free.
 */
export function LevelContentSection({ title, children }: LevelContentSectionProps) {
  return (
    <Collapsible defaultOpen className="flex flex-col gap-4">
      <CollapsibleTrigger className="group/section-trigger flex w-full items-center justify-between gap-2 border-b border-border pb-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]/section-trigger:-rotate-90"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
