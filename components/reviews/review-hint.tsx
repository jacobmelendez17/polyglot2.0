import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ReviewHintView } from "@/domains/srs";

type ReviewHintProps = {
  hint: ReviewHintView;
  /** Spec 20 Review UI — Auto-Expand Info: reveal this hint's content automatically once true, without waiting for a click. */
  autoExpand: boolean;
};

/**
 * The optional pre-answer aid (spec 20 Review Hints). Renders nothing for
 * `hide`. `always_show_nuance` has no button at all — its one piece of
 * content is simply always visible. Every other mode is click-to-reveal
 * ("without simply revealing everything immediately"), remounted per
 * question via `key={question.questionId}` at the call site so its local
 * reveal state always starts fresh, the same way `AnswerField`/`RevealField`
 * do.
 */
export function ReviewHint({ hint, autoExpand }: ReviewHintProps) {
  if (hint.mode === "hide") return null;
  if (hint.mode === "always_show_nuance") {
    return hint.nuance ? <NuanceText nuance={hint.nuance} /> : null;
  }
  if (hint.mode === "hint") {
    return hint.nuance ? <SingleReveal label="Show Hint" content={hint.nuance} autoExpand={autoExpand} /> : null;
  }
  if (hint.mode === "show") {
    return <SingleReveal label="Show Meaning" content={hint.translation} autoExpand={autoExpand} />;
  }
  return <MoreReveal hint={hint} autoExpand={autoExpand} />;
}

function NuanceText({ nuance }: { nuance: string }) {
  return <p className="max-w-sm text-center text-sm text-muted-foreground">{nuance}</p>;
}

function SingleReveal({ label, content, autoExpand }: { label: string; content: string; autoExpand: boolean }) {
  const [manuallyRevealed, setManuallyRevealed] = useState(false);

  if (manuallyRevealed || autoExpand) return <NuanceText nuance={content} />;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => setManuallyRevealed(true)}>
      {label}
    </Button>
  );
}

/**
 * Hint Mode "more": two pieces of content, revealed one click at a time in
 * whichever order Hint Order picks — the only mode that setting affects.
 */
function MoreReveal({ hint, autoExpand }: { hint: Extract<ReviewHintView, { mode: "more" }>; autoExpand: boolean }) {
  const [manualCount, setManualCount] = useState(0);

  const steps =
    hint.order === "nuance_first"
      ? [
          { label: "Show Hint", content: hint.nuance },
          { label: "Show Meaning", content: hint.translation },
        ]
      : [
          { label: "Show Meaning", content: hint.translation },
          { label: "Show Hint", content: hint.nuance },
        ];
  // A step with no content (e.g. no authored nuance note) is skipped rather
  // than offering a button that reveals nothing.
  const availableSteps = steps.filter((step): step is { label: string; content: string } => Boolean(step.content));
  const revealedCount = autoExpand ? availableSteps.length : manualCount;

  return (
    <div className="flex flex-col items-center gap-2">
      {availableSteps.slice(0, revealedCount).map((step) => (
        <NuanceText key={step.label} nuance={step.content} />
      ))}
      {revealedCount < availableSteps.length ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setManualCount((count) => count + 1)}>
          {availableSteps[revealedCount].label}
        </Button>
      ) : null}
    </div>
  );
}
