"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { DictionaryOverridableField } from "@/db/schema";

import {
  AcceptedAnswersEditor,
  type AcceptedAnswerValue,
} from "./accepted-answers-editor";
import { RegisterSelect } from "./register-select";
import type { RegisterEditorValue } from "./register-value";

export type VocabularyEditorValue = {
  vocabularyGroupId: string;
  term: string;
  primaryMeaning: string;
  definition: string;
  article: string;
  partOfSpeech: string;
  pronunciation: string;
  ipa: string;
  context: string;
  creatorNotes: string;
  /** Spec 18. `REGISTER_UNSET` when nobody has classified the word. */
  register: RegisterEditorValue;
  acceptedAnswers: AcceptedAnswerValue[];
};

export type ResolvedVocabularyFieldInfo = {
  confirmed: boolean;
  definition: string | null;
  ipa: string | null;
  lemma: string | null;
  partOfSpeech: string | null;
  /** Fields an author has taken over from the dictionary (spec 17). */
  overrides: DictionaryOverridableField[];
};

type VocabularyEditorProps = {
  value: VocabularyEditorValue;
  onChange: (next: VocabularyEditorValue) => void;
  groups: { id: string; name: string; levelNumber: number }[];
  /**
   * The confirmed mapping's own values, when there is one (2026-09-07
   * decision). `undefined` — no mapping fetched at all, e.g. while creating
   * a brand-new item — behaves exactly like before.
   *
   * These fields stay **editable** (spec 17). They used to render read-only
   * here, on the reasoning that a confirmed mapping overwrote whatever was
   * typed; approving a match therefore locked the very fields it filled.
   * Editing one now takes authorship of it, and the dictionary stops
   * overwriting it until it is reset.
   */
  resolved?: ResolvedVocabularyFieldInfo;
  /** Hands one field back to the dictionary. Absent while creating an item, which has no stored overrides yet. */
  onResetField?: (field: DictionaryOverridableField) => void;
  /** True while a reset request is in flight, so the control can be disabled. */
  isResetting?: boolean;
};

/** Spec 11 rewrite's "Vocabulary Editor" — every authoritative vocabulary field the current curriculum domain represents. */
export function VocabularyEditor({
  value,
  onChange,
  groups,
  resolved,
  onResetField,
  isResetting,
}: VocabularyEditorProps) {
  function set<K extends keyof VocabularyEditorValue>(
    key: K,
    fieldValue: VocabularyEditorValue[K],
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  function provenanceFor(
    field: DictionaryOverridableField,
    dictionaryValue: string | null,
  ) {
    if (!resolved?.confirmed) return null;
    return (
      <FieldProvenance
        authored={resolved.overrides.includes(field)}
        dictionaryValue={dictionaryValue}
        lemma={resolved.lemma}
        onReset={onResetField ? () => onResetField(field) : undefined}
        isResetting={isResetting}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Term</span>
          <Input
            className="mt-1"
            value={value.term}
            onChange={(e) => set("term", e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Article</span>
          <Input
            className="mt-1"
            value={value.article}
            onChange={(e) => set("article", e.target.value)}
            placeholder="el, la, ..."
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Primary meaning</span>
          <Input
            className="mt-1"
            value={value.primaryMeaning}
            onChange={(e) => set("primaryMeaning", e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Part of speech</span>
          <Input
            className="mt-1"
            value={value.partOfSpeech}
            onChange={(e) => set("partOfSpeech", e.target.value)}
            required
          />
          {provenanceFor("partOfSpeech", resolved?.partOfSpeech ?? null)}
        </label>
        <RegisterSelect
          value={value.register}
          onChange={(register) => onChange({ ...value, register })}
        />
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Group / theme</span>
        <Select
          value={value.vocabularyGroupId}
          onValueChange={(v) => set("vocabularyGroupId", v)}
        >
          <SelectTrigger className="mt-1 w-full" aria-label="Group / theme">
            <SelectValue placeholder="Select a group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                L{group.levelNumber} — {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Pronunciation</span>
          <Input
            className="mt-1"
            value={value.pronunciation}
            onChange={(e) => set("pronunciation", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">IPA</span>
          <Input
            className="mt-1 font-mono"
            value={value.ipa}
            onChange={(e) => set("ipa", e.target.value)}
          />
          {provenanceFor("ipa", resolved?.ipa ?? null)}
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Teaching meaning</span>
        <Textarea
          className="mt-1"
          value={value.definition}
          onChange={(e) => set("definition", e.target.value)}
        />
        {provenanceFor("definition", resolved?.definition ?? null)}
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">
          Context (how it&apos;s actually used)
        </span>
        <Textarea
          className="mt-1"
          value={value.context}
          onChange={(e) => set("context", e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Creator notes</span>
        {resolved?.confirmed ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Optional — expands on the dictionary meaning above, not a
            replacement for it.
          </span>
        ) : null}
        <Textarea
          className="mt-1"
          value={value.creatorNotes}
          onChange={(e) => set("creatorNotes", e.target.value)}
        />
      </label>

      <AcceptedAnswersEditor
        value={value.acceptedAnswers}
        onChange={(v) => set("acceptedAnswers", v)}
      />
    </div>
  );
}

/**
 * What a dictionary-backed field currently is, and how to change that
 * (spec 17).
 *
 * Two states, and the difference matters to an author: the value came from
 * the confirmed mapping and will keep following it, or someone has taken it
 * over by hand and the dictionary no longer touches it. The dictionary's own
 * value stays visible in the authored case, so resetting is an informed
 * choice rather than a leap.
 */
function FieldProvenance({
  authored,
  dictionaryValue,
  lemma,
  onReset,
  isResetting,
}: {
  authored: boolean;
  dictionaryValue: string | null;
  lemma: string | null;
  onReset?: () => void;
  isResetting?: boolean;
}) {
  if (!authored) {
    return (
      <span className="mt-1 block text-xs font-normal text-muted-foreground">
        From the confirmed dictionary mapping{lemma ? ` (${lemma})` : ""}.
        Editing this takes it over.
      </span>
    );
  }

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal">
      <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-foreground">
        Edited by hand
      </span>
      <span className="text-muted-foreground">
        The dictionary says{" "}
        {dictionaryValue ? (
          <span className="text-foreground">{dictionaryValue}</span>
        ) : (
          "nothing for this field"
        )}
        .
      </span>
      {onReset ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 cursor-pointer px-2"
          disabled={isResetting}
          onClick={onReset}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Reset to dictionary
        </Button>
      ) : null}
    </span>
  );
}
