"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { AcceptedAnswersEditor, type AcceptedAnswerValue } from "./accepted-answers-editor";
import { RegisterSelect } from "./register-select";
import type { RegisterEditorValue } from "./register-value";

export type GrammarQuestionDirection = "targetToEnglish" | "englishToTarget";

export type GrammarEditorValue = {
  title: string;
  structure: string;
  primaryMeaning: string;
  explanation: string;
  category: string;
  creatorNotes: string;
  /** Spec 18. `REGISTER_UNSET` when nobody has classified the structure. */
  register: RegisterEditorValue;
  requiredDirections: GrammarQuestionDirection[];
  acceptedAnswers: AcceptedAnswerValue[];
};

type GrammarEditorProps = {
  value: GrammarEditorValue;
  onChange: (next: GrammarEditorValue) => void;
};

const DIRECTION_OPTIONS: { value: GrammarQuestionDirection; label: string }[] = [
  { value: "targetToEnglish", label: "Target language → English" },
  { value: "englishToTarget", label: "English → Target language" },
];

/**
 * Spec 11 rewrite's "Grammar Editor". `requiredQuestions` only supports the
 * `"translation"` format today (architecture.md/`db/schema/curriculum.ts`'s
 * `GrammarQuestionFormat` — no other format is implemented anywhere in this
 * codebase's lesson/review UI yet), so the only real configuration is which
 * direction(s) are required — shown as plain checkboxes rather than a
 * hardcoded single exercise type, so a future format can extend this
 * without redesigning the editor.
 */
export function GrammarEditor({ value, onChange }: GrammarEditorProps) {
  function set<K extends keyof GrammarEditorValue>(key: K, fieldValue: GrammarEditorValue[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  function toggleDirection(direction: GrammarQuestionDirection, checked: boolean) {
    const next = checked
      ? [...value.requiredDirections, direction]
      : value.requiredDirections.filter((d) => d !== direction);
    set("requiredDirections", next);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Structure</span>
          <Input className="mt-1" value={value.structure} onChange={(e) => set("structure", e.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Primary translation</span>
          <Input className="mt-1" value={value.primaryMeaning} onChange={(e) => set("primaryMeaning", e.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Title (optional, longer name)</span>
          <Input className="mt-1" value={value.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Category</span>
          <Input className="mt-1" value={value.category} onChange={(e) => set("category", e.target.value)} />
        </label>
        <label className="block text-sm">
          <RegisterSelect value={value.register} onChange={(register) => onChange({ ...value, register })} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Full explanation</span>
        <Textarea className="mt-1" value={value.explanation} onChange={(e) => set("explanation", e.target.value)} required />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Required review directions</legend>
        {DIRECTION_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.requiredDirections.includes(option.value)}
              onChange={(e) => toggleDirection(option.value, e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Creator notes</span>
        <Textarea className="mt-1" value={value.creatorNotes} onChange={(e) => set("creatorNotes", e.target.value)} />
      </label>

      <AcceptedAnswersEditor value={value.acceptedAnswers} onChange={(v) => set("acceptedAnswers", v)} />
    </div>
  );
}
