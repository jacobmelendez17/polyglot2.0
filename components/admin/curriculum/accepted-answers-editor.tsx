"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type AcceptedAnswerValue = { side: "term" | "meaning"; value: string };

type AcceptedAnswersEditorProps = {
  value: AcceptedAnswerValue[];
  onChange: (next: AcceptedAnswerValue[]) => void;
};

/**
 * Official accepted-answer list (spec 11 rewrite's "Accepted Vocabulary
 * Answers"/grammar "accepted answers") — distinct from `user_synonyms`,
 * which stays private learner content and has no admin editor at all.
 * "Term"/"meaning" mirrors `user_synonyms`' own side distinction so
 * `domains/srs`'s answer resolution can merge official and learner-
 * submitted answers uniformly.
 */
export function AcceptedAnswersEditor({ value, onChange }: AcceptedAnswersEditorProps) {
  function updateRow(index: number, patch: Partial<AcceptedAnswerValue>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...value, { side: "meaning", value: "" }]);
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">Accepted answers</span>
      {value.length === 0 ? <p className="text-sm text-muted-foreground">No additional accepted answers yet.</p> : null}
      {value.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select value={row.side} onValueChange={(side) => updateRow(index, { side: side as "term" | "meaning" })}>
            <SelectTrigger aria-label={`Side for accepted answer ${index + 1}`} className="w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="term">Term</SelectItem>
              <SelectItem value="meaning">Meaning</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label={`Accepted answer ${index + 1} value`}
            value={row.value}
            onChange={(event) => updateRow(index, { value: event.target.value })}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove accepted answer ${index + 1}`} onClick={() => removeRow(index)}>
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus /> Add accepted answer
      </Button>
    </div>
  );
}
