import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { PracticeCardView } from "@/domains/practice";
import { cn } from "@/lib/utils";

type PracticeNoteProps = {
  practice: PracticeCardView;
  /** Alternates the tilt so a stack of notes looks hand-pinned. */
  index: number;
};

/**
 * A practice "pinned" to its grove. When its route exists the whole note is
 * one link (an overlay anchor, so the note is a single tab stop and never
 * nests interactive elements); when it does not, the note is inert and says
 * so instead of linking to a 404.
 */
export function PracticeNote({ practice, index }: PracticeNoteProps) {
  const { title, description, href, lastPracticedLabel } = practice;

  return (
    <article
      className={cn(
        "relative flex flex-col gap-1.5 rounded-[3px_3px_14px_3px] bg-card px-3.5 pt-4.5 pb-3 shadow-md transition-transform duration-200 ease-out",
        "before:absolute before:-top-1.5 before:left-1/2 before:-ml-1.5 before:h-3 before:w-3 before:rounded-full before:bg-(--c) before:shadow-sm",
        index % 2 === 0 ? "-rotate-[1.6deg]" : "rotate-[1.4deg]",
        "hover:-translate-y-1 hover:rotate-0 focus-within:-translate-y-1 focus-within:rotate-0",
        "motion-reduce:transform-none motion-reduce:transition-none",
      )}
    >
      {href !== null ? (
        <Link
          href={href}
          aria-label={`Set up ${title}`}
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      ) : null}
      <h3 className="font-heading text-base font-semibold text-foreground">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {lastPracticedLabel ?? "Not tried yet"}
        </span>
        {href !== null ? (
          <span
            aria-hidden="true"
            className="flex h-6 items-center rounded-full bg-primary px-2 font-medium text-primary-foreground"
          >
            Set up
            <ChevronRight className="h-3 w-3" />
          </span>
        ) : (
          <span className="rounded-full border border-border px-2 py-0.5 font-medium text-muted-foreground">
            Coming soon
          </span>
        )}
      </div>
    </article>
  );
}
