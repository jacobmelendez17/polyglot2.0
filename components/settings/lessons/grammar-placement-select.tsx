"use client";

import { useState } from "react";

import { updateGrammarPlacementAction } from "@/app/(app)/settings/lessons/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GrammarPlacement } from "@/domains/users";

type SaveState = "idle" | "saving" | "saved" | "error";

const OPTIONS: { value: GrammarPlacement; label: string }[] = [
  { value: "first", label: "First" },
  { value: "last", label: "Last" },
  { value: "no_preference", label: "No Preference" },
];

type GrammarPlacementSelectProps = {
  initialValue: GrammarPlacement;
};

/**
 * Spec 20 Lessons — Grammar Placement. Only meaningful in Variety mode
 * (Default Order always teaches grammar first; Choose Group as You Go
 * follows the grammar curriculum's own order regardless) — shown always
 * rather than hidden/disabled under the other modes, since the setting
 * still has a real stored value and takes effect the moment Variety is
 * chosen, per "this setting changes learner-specific queue ordering only."
 */
export function GrammarPlacementSelect({ initialValue }: GrammarPlacementSelectProps) {
  const [value, setValue] = useState<GrammarPlacement>(initialValue);
  const [state, setState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleChange(next: string) {
    const previous = value;
    const nextValue = next as GrammarPlacement;
    setValue(nextValue);
    setState("saving");
    setErrorMessage(null);

    const result = await updateGrammarPlacementAction({ grammarPlacement: nextValue });

    if (!result.ok) {
      setValue(previous);
      setState("error");
      setErrorMessage(result.error.message);
      return;
    }
    setState("saved");
  }

  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <p className="text-sm font-medium text-foreground">Grammar Placement</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Only applies to Variety — Default Order and Choose Group as You Go set grammar&apos;s position on their own.
      </p>
      <div className="mt-2">
        <Select value={value} onValueChange={handleChange} disabled={state === "saving"}>
          <SelectTrigger aria-label="Grammar Placement" className="w-full sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-sm" aria-live="polite">
        {state === "saving" && <span className="text-muted-foreground">Saving…</span>}
        {state === "saved" && <span className="text-state-success">Saved</span>}
        {state === "error" && <span className="text-destructive">{errorMessage ?? "Could not save setting."}</span>}
      </p>
    </div>
  );
}
