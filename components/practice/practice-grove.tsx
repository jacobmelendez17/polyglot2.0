import {
  countLitActivityDots,
  PRACTICE_ACTIVITY_DOT_COUNT,
} from "@/domains/practice";
import type { PracticeGroveView } from "@/domains/practice";
import { PRACTICE_ACTIVITY_WINDOW_DAYS } from "@/domains/practice";
import { cn } from "@/lib/utils";

import { PRACTICE_SKILL_ICONS } from "./practice-icons";
import { PracticeNote } from "./practice-note";

type PracticeGroveProps = {
  grove: PracticeGroveView;
  /** Position in the grid, used to stagger the entrance. */
  index: number;
};

export function PracticeGrove({ grove, index }: PracticeGroveProps) {
  const Icon = PRACTICE_SKILL_ICONS[grove.skill];
  const headingId = `practice-grove-${grove.skill}`;
  const litDots = countLitActivityDots(grove.recentSessionCount);
  const sessionWord = grove.recentSessionCount === 1 ? "session" : "sessions";

  return (
    <section
      aria-labelledby={headingId}
      data-practice-tone={grove.skill}
      className="practice-grove animate-practice-rise flex flex-col gap-3 transition-opacity duration-200"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="practice-sketch flex items-center gap-2 rounded-[10px] border-t-4 border-t-(--c) bg-background px-2.5 py-2">
        <span
          className="practice-blob flex h-8 w-8 shrink-0 items-center justify-center border-[1.5px] border-(--c) bg-(--c)/20"
          aria-hidden="true"
        >
          <Icon className="h-4 w-4 text-foreground" />
        </span>
        <div>
          <h2
            id={headingId}
            className="font-heading text-base font-semibold text-foreground"
          >
            {grove.label}
          </h2>
          <p className="text-xs text-muted-foreground">{grove.tagline}</p>
        </div>
      </div>

      <p
        className="flex items-center gap-1 px-1 text-xs text-muted-foreground"
        aria-label={`${grove.recentSessionCount} ${sessionWord} in the last ${PRACTICE_ACTIVITY_WINDOW_DAYS} days`}
      >
        {Array.from({ length: PRACTICE_ACTIVITY_DOT_COUNT }, (_, dot) => (
          <span
            key={dot}
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full border-[1.5px] border-foreground/30",
              dot < litDots && "border-transparent bg-(--c)",
            )}
          />
        ))}
        <span aria-hidden="true" className="ml-1">
          {grove.recentSessionCount} in {PRACTICE_ACTIVITY_WINDOW_DAYS} days
        </span>
      </p>

      <div className="flex flex-col gap-4">
        {grove.practices.map((practice, noteIndex) => (
          <PracticeNote
            key={practice.type}
            practice={practice}
            index={noteIndex}
          />
        ))}
      </div>
    </section>
  );
}
