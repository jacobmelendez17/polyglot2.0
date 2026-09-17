import { Flame, GraduationCap, Sparkles } from "lucide-react";

/**
 * Slide 5's visual demonstration (spec 15): a calm, settled composition
 * rather than another looping mechanic — this is the slide the learner
 * leaves from, so it should feel like arriving, not like another lesson.
 *
 * The emphasis animation spec 15 describes belongs to the `Start Now!`
 * button, not here — see `onboarding-navigation.tsx`.
 *
 * Purely visual, prop-free, and replaceable on its own (see
 * `welcome-slide.tsx` for the full rationale).
 */
const HIGHLIGHTS = [
  { icon: GraduationCap, label: "Level 1", detail: "unlocked", delay: "" },
  {
    icon: Flame,
    label: "Day 1",
    detail: "streak starts today",
    delay: "ob-delay-2",
  },
  {
    icon: Sparkles,
    label: "First lesson",
    detail: "ready when you are",
    delay: "ob-delay-4",
  },
] as const;

export function StartSlide() {
  return (
    <div
      aria-hidden="true"
      className="flex h-56 w-full items-center justify-center sm:h-72"
    >
      <ul className="flex w-full max-w-sm flex-col gap-2">
        {HIGHLIGHTS.map(({ icon: Icon, label, detail, delay }) => (
          <li
            key={label}
            className={`flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 animate-bob ${delay}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-srs-fluent/20">
              <Icon className="h-4 w-4 text-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                {label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
