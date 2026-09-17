import {
  Check,
  CircleHelp,
  CircleSlash,
  Lock,
  TriangleAlert,
} from "lucide-react";

import {
  MATCH_CONFIDENCE_LABELS,
  MATCH_STATUS_LABELS,
} from "@/domains/lexicon";
import type {
  DictionaryMatchConfidence,
  DictionaryMatchStatus,
} from "@/domains/lexicon";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  DictionaryMatchStatus,
  { icon: typeof Check; className: string }
> = {
  auto_matched: {
    icon: Check,
    className: "text-state-success bg-state-success/15",
  },
  manual: { icon: Lock, className: "text-state-success bg-state-success/15" },
  review_required: {
    icon: TriangleAlert,
    className: "text-state-warning bg-state-warning/15",
  },
  unmatched: { icon: CircleSlash, className: "text-muted-foreground bg-muted" },
  source_data_not_imported: {
    icon: CircleHelp,
    className: "text-muted-foreground bg-muted/50",
  },
};

/**
 * Mapping state as an icon plus text, never colour alone (ui-context.md's
 * accessibility rule) — the same shape as `CurriculumStatusBadge`.
 *
 * A missing mapping row renders as "Not imported" rather than as a blank
 * cell: an item nothing has looked at yet is a real, actionable state, and
 * spec 12 requires it stay distinguishable from a searched-and-empty result.
 */
export function MappingStatusBadge({
  status,
  confidence,
}: {
  status: DictionaryMatchStatus | null;
  confidence?: DictionaryMatchConfidence | null;
}) {
  const resolved = status ?? "source_data_not_imported";
  const { icon: Icon, className } = STATUS_CONFIG[resolved];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {MATCH_STATUS_LABELS[resolved]}
      {confidence ? (
        <span className="font-normal opacity-80">
          · {MATCH_CONFIDENCE_LABELS[confidence]}
        </span>
      ) : null}
    </span>
  );
}
