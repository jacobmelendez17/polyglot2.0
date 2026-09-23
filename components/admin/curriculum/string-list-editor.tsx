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
};

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
    </div>
  );
}
