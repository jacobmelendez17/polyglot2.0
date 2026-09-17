import { Check, CircleHelp, CircleSlash } from "lucide-react";

import { NOT_LISTED_CAVEAT, REGIONAL_STATUS_LABELS } from "@/domains/lexicon";
import type { RegionalEvidenceStatus } from "@/domains/lexicon";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  RegionalEvidenceStatus,
  { icon: typeof Check; className: string; describe: boolean }
> = {
  recognized: {
    icon: Check,
    className: "text-state-success bg-state-success/15",
    describe: false,
  },
  // Deliberately not styled as an error. Absence from a word list is weak
  // evidence, and a red badge would tell an admin the opposite of what spec
  // 12 says this value means.
  not_listed: {
    icon: CircleSlash,
    className: "text-muted-foreground bg-muted",
    describe: true,
  },
  unknown: {
    icon: CircleHelp,
    className: "text-muted-foreground bg-muted/50",
    describe: false,
  },
};

export function RegionalEvidenceBadge({
  regionCode,
  status,
  matchedForm,
}: {
  regionCode: string;
  status: RegionalEvidenceStatus;
  matchedForm?: string | null;
}) {
  const { icon: Icon, className, describe } = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
      title={describe ? NOT_LISTED_CAVEAT : (matchedForm ?? undefined)}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="font-normal opacity-80">{regionCode}</span>
      {REGIONAL_STATUS_LABELS[status]}
    </span>
  );
}
