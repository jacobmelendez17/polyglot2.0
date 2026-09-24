import Link from "next/link";
import { Footprints, Play, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PracticeWalkView } from "@/domains/practice";
import { cn } from "@/lib/utils";

import { PRACTICE_TYPE_ICONS } from "./practice-icons";

type PracticeWalkCardProps = { walk: PracticeWalkView };

/**
 * "Today's walk": a short path through several practices. Rendered from the
 * read model only — which practices make the walk is decided in the domain,
 * never here. While the walk cannot be started, both actions render disabled
 * with a stated reason rather than as live-looking controls.
 */
export function PracticeWalkCard({ walk }: PracticeWalkCardProps) {
  const { startHref } = walk;
  const isStartable = startHref !== null;

  return (
    <section
      aria-labelledby="practice-walk-title"
      className="practice-sketch animate-practice-rise flex flex-col gap-4 bg-card p-5 sm:p-6"
      data-practice-tone="progress"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Footprints className="h-6 w-6 text-(--c)" aria-hidden="true" />
        <div className="min-w-48 flex-1">
          <h2
            id="practice-walk-title"
            className="font-heading text-xl font-semibold text-foreground"
          >
            Today&apos;s walk · about {walk.totalMinutes} minutes
          </h2>
          <p className="text-sm text-muted-foreground">
            {isStartable
              ? `A short path through ${walk.steps.length} practices.`
              : "The guided walk is coming soon. You can already see the path it will take."}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled>
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
          Shuffle
        </Button>
        {startHref !== null ? (
          <Button asChild size="sm">
            <Link href={startHref}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Start walk
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Start walk
          </Button>
        )}
      </div>

      <ol className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))]">
        {walk.steps.map((step, index) => {
          const Icon = PRACTICE_TYPE_ICONS[step.type];
          return (
            <li
              key={step.type}
              className={cn(
                "practice-sketch relative flex items-center gap-3 rounded-[14px] bg-background p-4",
                // A dashed connector between steps, only where steps sit in a row.
                index < walk.steps.length - 1 &&
                  "sm:after:absolute sm:after:top-1/2 sm:after:-right-4 sm:after:w-4 sm:after:border-t-2 sm:after:border-dashed sm:after:border-(--c) sm:after:content-['']",
              )}
            >
              <span
                className="practice-blob flex h-10 w-10 shrink-0 items-center justify-center border-[1.5px] border-(--c) bg-(--c)/20"
                aria-hidden="true"
              >
                <Icon className="h-5 w-5 text-foreground" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Step {index + 1} · {step.minutes} min
                </p>
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {step.title}
                </h3>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
