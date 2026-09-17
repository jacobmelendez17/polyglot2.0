import type { ReactNode } from "react";

type DeckEmptyStateProps = {
  title: string;
  message: string;
  /** An optional next action — an empty state should say what to do, not just that there is nothing. */
  action?: ReactNode;
};

/**
 * The designed empty state for the decks pages (ui-context.md: "Empty is a
 * designed state with an explanation and a next action"). Callers pass
 * different copy for "nothing yet" and "nothing matches your filter" —
 * spec 14 treats those as different situations, and so does this.
 */
export function DeckEmptyState({
  title,
  message,
  action,
}: DeckEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
      <p className="font-heading text-base font-semibold text-foreground">
        {title}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
