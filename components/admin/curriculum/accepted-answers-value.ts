import type { AcceptedAnswerInput } from "@/domains/curriculum";

/**
 * The two Synonyms/Variants lists' conversions, outside `string-list-editor.tsx`'s
 * `"use client"` boundary — same reasoning as `register-value.ts`. A server
 * component (the admin item page, the learner item page's admin slots) has
 * to call these to map stored `accepted_answers` rows into the two editors'
 * initial values, and a `"use client"` file's non-component exports cannot
 * be called from server code, only rendered.
 */

/** Non-empty, trimmed entries only — a blank row from "Add" left untouched is not a real answer. */
function cleanValues(values: string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v !== "");
}

/** Combines a Synonyms list and a Variants list back into the flat `{side, value}[]` shape `updateItemAction`/`createItemAction` expect. */
export function toAcceptedAnswersPayload(
  synonyms: string[],
  variants: string[],
): AcceptedAnswerInput[] {
  return [
    ...cleanValues(synonyms).map((value) => ({
      side: "meaning" as const,
      value,
    })),
    ...cleanValues(variants).map((value) => ({
      side: "term" as const,
      value,
    })),
  ];
}

/** The inverse split, for loading a stored `{side, value}[]` back into a Synonyms list and a Variants list. */
export function splitAcceptedAnswers(answers: AcceptedAnswerInput[]): {
  synonyms: string[];
  variants: string[];
} {
  return {
    synonyms: answers
      .filter((answer) => answer.side === "meaning")
      .map((answer) => answer.value),
    variants: answers
      .filter((answer) => answer.side === "term")
      .map((answer) => answer.value),
  };
}
