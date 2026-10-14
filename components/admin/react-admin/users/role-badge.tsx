import {
  FlaskConical,
  PenLine,
  ShieldCheck,
  Terminal,
  User,
} from "lucide-react";

import type { UserRole } from "@/domains/users";
import { cn } from "@/lib/utils";

import { ROLE_LABELS } from "./role-model";

const ROLE_STYLE: Record<UserRole, { icon: typeof User; className: string }> = {
  user: { icon: User, className: "text-muted-foreground bg-muted" },
  "beta-tester": {
    icon: FlaskConical,
    className: "text-state-warning bg-state-warning/15",
  },
  writer: { icon: PenLine, className: "text-primary bg-primary/10" },
  developer: { icon: Terminal, className: "text-primary bg-primary/10" },
  admin: {
    icon: ShieldCheck,
    className: "text-state-success bg-state-success/15",
  },
};

/** A role is shown with an icon and its name together, never colour alone (ui-context.md's accessibility rule). */
export function RoleBadge({ role }: { role: UserRole }) {
  const { icon: Icon, className } = ROLE_STYLE[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {ROLE_LABELS[role]}
    </span>
  );
}
