import { Archive, CircleDot, Clock, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CurriculumStatus } from "@/domains/curriculum";

const STATUS_CONFIG: Record<CurriculumStatus, { label: string; icon: typeof Check; className: string }> = {
  draft: { label: "Draft", icon: CircleDot, className: "text-muted-foreground bg-muted" },
  pending: { label: "Pending", icon: Clock, className: "text-state-warning bg-state-warning/15" },
  published: { label: "Published", icon: Check, className: "text-state-success bg-state-success/15" },
  archived: { label: "Archived", icon: Archive, className: "text-muted-foreground bg-muted/50" },
};

/** Status is communicated with an icon and text together, never color alone (ui-context.md's accessibility rule). */
export function CurriculumStatusBadge({ status }: { status: CurriculumStatus }) {
  const { label, icon: Icon, className } = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
