"use client";

import { useState } from "react";

import { PronunciationButton } from "@/components/shared/pronunciation-button";
import type { ItemDetailPatternView } from "@/domains/curriculum";
import { cn } from "@/lib/utils";

type ContextSectionProps = {
  patterns: ItemDetailPatternView[];
  languageCode: string;
};

/**
 * Spec 18's Context card: `Pattern of Use` on the left, the selected
 * pattern's examples on the right.
 *
 * The patterns are spec 17's usage contexts (`comer` → `como`, `comes`,
 * `come`) — the user's 2026-09-09 decision to reuse them rather than build a
 * parallel table, so this renders content the Admin editor already authors.
 *
 * A real `tablist`/`tabpanel` here, unlike the section tabs above: these
 * genuinely do show one panel and hide the others, which is what the roles
 * describe. Arrow-key roving focus follows the WAI-ARIA tabs pattern, so the
 * list is operable without a pointer.
 */
export function ContextSection({ patterns, languageCode }: ContextSectionProps) {
  const [activeId, setActiveId] = useState(() => patterns[0]?.id ?? "");
  const active = patterns.find((pattern) => pattern.id === activeId) ?? patterns[0];

  if (patterns.length === 0 || !active) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !backward) return;

    event.preventDefault();
    const index = patterns.findIndex((pattern) => pattern.id === active!.id);
    const nextIndex = (index + (forward ? 1 : -1) + patterns.length) % patterns.length;
    const next = patterns[nextIndex];
    setActiveId(next.id);
    document.getElementById(`context-pattern-${next.id}`)?.focus();
  }

  return (
    <div className="rounded-xl bg-muted/30 p-4 ring-1 ring-foreground/5 sm:p-5">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground">Pattern of Use</h3>
          <div role="tablist" aria-orientation="vertical" aria-label="Pattern of use" onKeyDown={handleKeyDown} className="mt-3 flex flex-wrap gap-1.5 sm:flex-col">
            {patterns.map((pattern) => {
              const isActive = pattern.id === active.id;
              return (
                <button
                  key={pattern.id}
                  id={`context-pattern-${pattern.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`context-panel-${pattern.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveId(pattern.id)}
                  className={cn(
                    "cursor-pointer rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isActive ? "bg-card font-medium text-foreground ring-1 ring-foreground/10" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  {pattern.label}
                </button>
              );
            })}
          </div>
        </div>

        <div id={`context-panel-${active.id}`} role="tabpanel" aria-labelledby={`context-pattern-${active.id}`} tabIndex={0}>
          <h3 className="font-heading text-sm font-semibold text-foreground">Common Combinations</h3>
          {active.note ? <p className="mt-1 text-xs text-muted-foreground">{active.note}</p> : null}

          {active.examples.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-3">
              {active.examples.map((example) => (
                <li key={example.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{example.targetText}</p>
                    <p className="text-sm text-muted-foreground">{example.translation}</p>
                  </div>
                  <PronunciationButton text={example.spokenText} languageCode={languageCode} label={example.targetText} size="sm" />
                </li>
              ))}
            </ul>
          ) : (
            // An empty pattern is deliberately still offered: "this form
            // exists and nothing has been written for it" is more useful to a
            // learner than the form silently not existing (spec 17's rule).
            <p className="mt-3 text-sm text-muted-foreground">No examples for this pattern yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
