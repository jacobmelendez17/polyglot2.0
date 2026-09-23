"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StringListEditorProps = {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  emptyText: string;
  addLabel: string;
  /**
   * Values already shown to learners from a source this editor doesn't
   * own — a confirmed dictionary mapping's own synonyms/forms, for a
   * vocabulary item (spec 12's evidence, never itself sent to the server
   * from here). Shown so an admin can see everything a learner already
   * effectively sees before typing a new entry, rather than guessing and
   * risking a near-duplicate. Already-added values are filtered out
   * automatically; clicking a suggestion adds it with one click instead of
   * retyping it by hand.
   */
  suggestions?: string[];
  suggestionsLabel?: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A plain list of extra accepted-answer strings — one field per Synonym or
 * Variant, not a single generic list with a Term/Meaning side picker per
 * row (spec 11 rewrite's original shape, replaced 2026-09-23: an admin
 * reasonably expected two separate, clearly-labeled fields — "Synonyms" and
 * "Variants" — sitting near Translation/Part of speech, not one merged
 * "Accepted answers" list buried at the bottom of the form with a dropdown
 * to say which kind each row is).
 *
 * Used twice per vocabulary item (`side: "meaning"` → Synonyms, `side:
 * "term"` → Variants) and once per grammar item (Synonyms only — see
 * `GrammarEditor`'s docstring for why grammar has no Variants field).
 * `./accepted-answers-value.ts`'s `splitAcceptedAnswers`/
 * `toAcceptedAnswersPayload` convert two of these back into, and out of, the
 * flat `{side, value}[]` shape the server actually stores — kept outside
 * this file's `"use client"` boundary since server components need to call
 * them too (same reasoning as `register-value.ts`).
 */
export function StringListEditor({
  label,
  value,
  onChange,
  emptyText,
  addLabel,
  suggestions = [],
  suggestionsLabel,
}: StringListEditorProps) {
  function updateRow(index: number, next: string) {
    onChange(value.map((row, i) => (i === index ? next : row)));
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, ""]);
  }

  function addSuggestion(suggestion: string) {
    onChange([...value, suggestion]);
  }

  const alreadyPresent = new Set(value.map(normalize));
  const unaddedSuggestions = suggestions.filter(
    (suggestion) => !alreadyPresent.has(normalize(suggestion)),
  );

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : null}
      {value.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`${label} ${index + 1}`}
            value={row}
            onChange={(event) => updateRow(index, event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
            onClick={() => removeRow(index)}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus /> {addLabel}
      </Button>
      {unaddedSuggestions.length > 0 ? (
        <div className="space-y-1 pt-1">
          <p className="text-xs text-muted-foreground">
            {suggestionsLabel ??
              "Already shown to learners, from the dictionary:"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unaddedSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addSuggestion(suggestion)}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground ring-1 ring-foreground/10 hover:bg-muted/70"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
