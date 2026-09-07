import { Check, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LevelValidationResult } from "@/domains/curriculum";

type Row = { label: string; actual: number; expected: number; satisfied: boolean };

/** Spec 11 rewrite's "Levels Management" worked example, rendered literally: "Vocabulary 47/48 ⚠, Grammar 12/12 ✓, Groups 4/4 ✓". Status is always icon + text together, never color alone (ui-context.md). */
export function LevelValidationSummary({ validation }: { validation: LevelValidationResult }) {
  const rows: Row[] = [
    { label: "Vocabulary", ...validation.vocabularyItems },
    { label: "Grammar", ...validation.grammarItems },
    { label: "Groups", ...validation.vocabularyGroups },
  ];

  return (
    <dl className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={cn("flex items-center gap-1.5 font-medium", row.satisfied ? "text-state-success" : "text-state-warning")}>
            {row.actual} / {row.expected}
            {row.satisfied ? <Check className="h-3.5 w-3.5" aria-label="Satisfied" /> : <TriangleAlert className="h-3.5 w-3.5" aria-label="Not yet satisfied" />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
