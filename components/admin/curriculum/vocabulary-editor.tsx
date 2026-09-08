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

export type ResolvedVocabularyFieldInfo = {
  confirmed: boolean;
  definition: string | null;
  ipa: string | null;
  lemma: string | null;
};

type VocabularyEditorProps = {
  value: VocabularyEditorValue;
  onChange: (next: VocabularyEditorValue) => void;
  groups: { id: string; name: string; levelNumber: number }[];
  /**
   * When a dictionary mapping is confirmed (2026-09-07 decision), the
   * confirmed mapping's own definition/IPA become the *effective* values
   * everywhere the item is shown — editing the raw fields here would be a
   * no-op the moment that's true, so this replaces those two inputs with a
   * plain read-only display instead of letting an admin type into a field
   * nothing downstream will ever read. `undefined` (no mapping fetched at
   * all, e.g. while creating a brand-new item) behaves exactly like before.
   */
  resolved?: ResolvedVocabularyFieldInfo;
};

/** Spec 11 rewrite's "Vocabulary Editor" — every authoritative vocabulary field the current curriculum domain represents. */
export function VocabularyEditor({ value, onChange, groups, resolved }: VocabularyEditorProps) {
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
        {resolved?.confirmed ? (
          <ResolvedFieldDisplay label="IPA" value={resolved.ipa} lemma={resolved.lemma} monospace />
        ) : (
          <label className="block text-sm">
            <span className="font-medium text-foreground">IPA</span>
            <Input className="mt-1" value={value.ipa} onChange={(e) => set("ipa", e.target.value)} />
          </label>
        )}
      </div>

      {resolved?.confirmed ? (
        <ResolvedFieldDisplay label="Teaching meaning" value={resolved.definition} lemma={resolved.lemma} />
      ) : (
        <label className="block text-sm">
          <span className="font-medium text-foreground">Dictionary definition</span>
          <Textarea className="mt-1" value={value.definition} onChange={(e) => set("definition", e.target.value)} />
        </label>
      )}

      <label className="block text-sm">
        <span className="font-medium text-foreground">Context (how it&apos;s actually used)</span>
        <Textarea className="mt-1" value={value.context} onChange={(e) => set("context", e.target.value)} />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Creator notes</span>
        {resolved?.confirmed ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">Optional — expands on the dictionary meaning above, not a replacement for it.</span>
        ) : null}
        <Textarea className="mt-1" value={value.creatorNotes} onChange={(e) => set("creatorNotes", e.target.value)} />
      </label>

      <AcceptedAnswersEditor value={value.acceptedAnswers} onChange={(v) => set("acceptedAnswers", v)} />
    </div>
  );
}

/** A field a confirmed dictionary mapping now controls — shown, never edited, here. Change it by reviewing the mapping below instead. */
function ResolvedFieldDisplay({ label, value, lemma, monospace }: { label: string; value: string | null; lemma: string | null; monospace?: boolean }) {
  return (
    <div className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="mt-1 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
        <p className={monospace ? "font-mono text-sm text-foreground" : "text-sm text-foreground"}>{value ?? "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">From the confirmed dictionary mapping{lemma ? ` (${lemma})` : ""} — review it below to change this.</p>
      </div>
    </div>
  );
}
