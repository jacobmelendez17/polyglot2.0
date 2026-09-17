/**
 * Slide 2's visual demonstration (spec 15): the SRS cycle as four stages
 * that light in sequence and loop.
 *
 * The chain deliberately leads with a grammar point rather than a word —
 * spec 15 is explicit that grammar must read as a foundational part of
 * progression, not as an afterthought to vocabulary-only SRS.
 *
 * Purely visual, prop-free, and replaceable on its own (see
 * `welcome-slide.tsx` for the full rationale).
 */
const STAGES = [
  { label: "Learn", detail: "ser / estar", delay: "ob-step-1" },
  { label: "Practice", detail: "in a lesson quiz", delay: "ob-step-2" },
  { label: "Review later", detail: "4 hours → 1 day", delay: "ob-step-3" },
  { label: "Strengthen", detail: "Familiar → Fluent", delay: "ob-step-4" },
] as const;

export function SrsSlide() {
  return (
    <div
      aria-hidden="true"
      className="flex h-56 w-full items-center justify-center sm:h-72"
    >
      <ol className="flex w-full max-w-md flex-col gap-2">
        {STAGES.map((stage, index) => (
          <li
            key={stage.label}
            className={`flex items-center gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10 animate-ob-step ${stage.delay}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-learning-grammar/20 text-xs font-semibold text-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {stage.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {stage.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
