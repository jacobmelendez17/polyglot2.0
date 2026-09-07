import Link from "next/link";
import { Archive, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CurriculumStatus } from "@/domains/curriculum";

type ItemType = "vocabulary" | "grammar";

type ItemDetailHeaderProps = {
  itemType: ItemType;
  primary: string;
  secondary: string;
  levelNumber: number;
  groupName?: string;
  status: CurriculumStatus;
};

const CATEGORY_ACCENT: Record<ItemType, string> = {
  vocabulary: "text-learning-vocabulary",
  grammar: "text-learning-grammar",
};

const CATEGORY_LABEL: Record<ItemType, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
};

/**
 * Shared by both item types (spec 13's "Level/group" bullet applies to
 * either). The archived badge communicates status with an icon and text
 * together, never color alone, matching `CurriculumStatusBadge`'s existing
 * accessibility rule.
 */
export function ItemDetailHeader({ itemType, primary, secondary, levelNumber, groupName, status }: ItemDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={`/levels/${levelNumber}`}
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Level {levelNumber}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-xs font-semibold tracking-wide uppercase", CATEGORY_ACCENT[itemType])}>{CATEGORY_LABEL[itemType]}</span>
        {groupName ? <span className="text-xs text-muted-foreground">· {groupName}</span> : null}
        {status === "archived" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <Archive className="h-3 w-3" aria-hidden="true" />
            Archived
          </span>
        ) : null}
      </div>

      <div>
        <h1 className="font-heading text-3xl font-semibold text-foreground">{primary}</h1>
        <p className="mt-1 text-lg text-muted-foreground">{secondary}</p>
      </div>
    </div>
  );
}
