"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { AcceptedAnswersEditor, type AcceptedAnswerValue } from "./accepted-answers-editor";

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
  acceptedAnswers: AcceptedAnswerValue[];
};

type VocabularyEditorProps = {
  value: VocabularyEditorValue;
  onChange: (next: VocabularyEditorValue) => void;
  groups: { id: string; name: string; levelNumber: number }[];
};

/** Spec 11 rewrite's "Vocabulary Editor" — every authoritative vocabulary field the current curriculum domain represents. */
export function VocabularyEditor({ value, onChange, groups }: VocabularyEditorProps) {
  function set<K extends keyof VocabularyEditorValue>(key: K, fieldValue: VocabularyEditorValue[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Term</span>
          <Input className="mt-1" value={value.term} onChange={(e) => set("term", e.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Article</span>
          <Input className="mt-1" value={value.article} onChange={(e) => set("article", e.target.value)} placeholder="el, la, ..." />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Primary meaning</span>
          <Input className="mt-1" value={value.primaryMeaning} onChange={(e) => set("primaryMeaning", e.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Part of speech</span>
          <Input className="mt-1" value={value.partOfSpeech} onChange={(e) => set("partOfSpeech", e.target.value)} required />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Group / theme</span>
        <Select value={value.vocabularyGroupId} onValueChange={(v) => set("vocabularyGroupId", v)}>
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
          <Input className="mt-1" value={value.pronunciation} onChange={(e) => set("pronunciation", e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">IPA</span>
          <Input className="mt-1" value={value.ipa} onChange={(e) => set("ipa", e.target.value)} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Dictionary definition</span>
        <Textarea className="mt-1" value={value.definition} onChange={(e) => set("definition", e.target.value)} />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Context (how it&apos;s actually used)</span>
        <Textarea className="mt-1" value={value.context} onChange={(e) => set("context", e.target.value)} />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Creator notes</span>
        <Textarea className="mt-1" value={value.creatorNotes} onChange={(e) => set("creatorNotes", e.target.value)} />
      </label>

      <AcceptedAnswersEditor value={value.acceptedAnswers} onChange={(v) => set("acceptedAnswers", v)} />
    </div>
  );
}
