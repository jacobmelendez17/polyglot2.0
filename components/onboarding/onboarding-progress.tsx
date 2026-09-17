import { cn } from "@/lib/utils";

type OnboardingProgressProps = {
  currentIndex: number;
  total: number;
};

/**
 * The progress dots (spec 15). Three visually distinct states — completed,
 * current, remaining — and the position never shifts between slides: the dot
 * count is fixed, and only the *current* dot changes width, so the row's
 * total width is identical on every screen.
 *
 * Accessible progress is carried by text, not by the dots: the dots
 * themselves are decorative (`aria-hidden`) and a visually hidden live region
 * announces "Step 2 of 5". Reading five unlabelled dots would tell a screen
 * reader user nothing.
 */
export function OnboardingProgress({
  currentIndex,
  total,
}: OnboardingProgressProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p aria-live="polite" className="sr-only">
        Step {currentIndex + 1} of {total}
      </p>
      <div aria-hidden="true" className="flex items-center gap-2">
        {Array.from({ length: total }, (_, index) => {
          const isCurrent = index === currentIndex;
          const isCompleted = index < currentIndex;
          return (
            <span
              key={index}
              className={cn(
                "h-2 rounded-full transition-[width,background-color] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none",
                // Only the width of the *current* dot changes, and the gap is
                // fixed, so the row occupies the same space on every slide.
                isCurrent ? "w-6 bg-foreground" : "w-2",
                isCompleted && "bg-foreground/50",
                !isCurrent && !isCompleted && "bg-foreground/20",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
