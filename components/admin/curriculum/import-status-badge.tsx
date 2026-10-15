import {
  Check,
  CircleAlert,
  Clock,
  ListChecks,
  Loader,
  type LucideIcon,
} from "lucide-react";

import type { AdminImportStatus } from "@/domains/admin";
import { cn } from "@/lib/utils";

import {
  importStatusView,
  type ImportStatusIcon,
  type ImportStatusTone,
} from "./import-status";

const ICONS: Record<ImportStatusIcon, LucideIcon> = {
  check: Check,
  alert: CircleAlert,
  review: ListChecks,
  waiting: Clock,
  processing: Loader,
};

const TONES: Record<ImportStatusTone, string> = {
  success: "text-state-success bg-state-success/15",
  warning: "text-state-warning bg-state-warning/15",
  error: "text-state-error bg-state-error/15",
  neutral: "text-muted-foreground bg-muted",
};

/** An import's status as the same kind of badge the curriculum's statuses use: an icon and text together, never colour alone (ui-context.md's accessibility rule). */
export function ImportStatusBadge({ status }: { status: AdminImportStatus }) {
  const { label, icon, tone } = importStatusView(status);
  const Icon = ICONS[icon];
  return (
    <span
      className={cn(
        // One line wherever there is room (a wrapped "Ready to / import" looks
        // like two things); on a phone the column is too narrow for that.
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium sm:whitespace-nowrap",
        TONES[tone],
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
