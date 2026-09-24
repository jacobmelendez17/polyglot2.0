import { ExitFocusButton } from "@/components/shared/exit-focus-button";
import { Progress } from "@/components/ui/progress";

type ReviewTopBarProps = {
  onExit: () => void;
  /** 0-100 — share of this session's required questions satisfied so far. */
  progressPercent: number;
  remaining: number;
  /** Null before any question has been attempted this session. */
  accuracyPercent: number | null;
  /** Spec 20 Review UI — Focus Mode: hides the accuracy percentage, the one nonessential element here — Exit, progress, and remaining count all stay (spec's own list of what must never be removed). */
  focusMode?: boolean;
};

/**
 * Spec 09 §16's desktop structure: Exit (left) — progress bar (center) —
 * compact session stats (right). Stays a single row on mobile too (no
 * horizontal overflow) since every element here is intentionally compact.
 */
export function ReviewTopBar({
  onExit,
  progressPercent,
  remaining,
  accuracyPercent,
  focusMode = false,
}: ReviewTopBarProps) {
  return (
    <div className="flex items-center gap-4">
      <ExitFocusButton label="Exit review" onClick={onExit} size="large" />

      <Progress
        value={progressPercent}
        aria-label="Review progress"
        className="h-3 flex-1"
      />

      <p className="shrink-0 text-lg font-medium whitespace-nowrap text-muted-foreground">
        {remaining} left
        {!focusMode && accuracyPercent !== null ? ` · ${accuracyPercent}%` : ""}
      </p>
    </div>
  );
}
