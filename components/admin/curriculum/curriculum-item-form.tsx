"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { createItemAction, resetDictionaryFieldAction, updateItemAction } from "@/app/(admin)/admin/curriculum/actions";
import type { DictionaryOverridableField } from "@/db/schema";
import type { AcceptedAnswerValue } from "./accepted-answers-editor";
import { GrammarEditor, type GrammarEditorValue, type GrammarQuestionDirection } from "./grammar-editor";
import { REGISTER_UNSET, registerPayload } from "./register-select";
import { VocabularyEditor, type ResolvedVocabularyFieldInfo, type VocabularyEditorValue } from "./vocabulary-editor";

type ItemType = "vocabulary" | "grammar";

// No `version` field here — publishing (and its `ADMIN_EDIT_CONFLICT`
// version check) is `PublishDialog`'s own concern, given `expectedVersion`
// directly by the page; this form only ever handles content field edits.
type ExistingItem = {
  learningItemId: string;
  type: ItemType;
  vocabulary?: VocabularyEditorValue;
  grammar?: GrammarEditorValue;
};

type CurriculumItemFormProps = {
  languageId: string;
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  existing?: ExistingItem;
  resolvedVocabulary?: ResolvedVocabularyFieldInfo;
};

const EMPTY_VOCAB: VocabularyEditorValue = {
  vocabularyGroupId: "",
  term: "",
  primaryMeaning: "",
  definition: "",
  article: "",
  partOfSpeech: "",
  pronunciation: "",
  ipa: "",
  context: "",
  creatorNotes: "",
  register: REGISTER_UNSET,
  acceptedAnswers: [],
};

const EMPTY_GRAMMAR: GrammarEditorValue = {
  title: "",
  structure: "",
  primaryMeaning: "",
  explanation: "",
  category: "",
  creatorNotes: "",
  register: REGISTER_UNSET,
  requiredDirections: ["targetToEnglish"],
  acceptedAnswers: [],
};

function nullIfEmpty(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toAcceptedAnswersInput(answers: AcceptedAnswerValue[]) {
  return answers.filter((a) => a.value.trim() !== "");
}

function vocabularyFieldsPayload(v: VocabularyEditorValue) {
  return {
    vocabularyGroupId: v.vocabularyGroupId,
    term: v.term,
    primaryMeaning: v.primaryMeaning,
    definition: nullIfEmpty(v.definition),
    article: nullIfEmpty(v.article),
    partOfSpeech: v.partOfSpeech,
    pronunciation: nullIfEmpty(v.pronunciation),
    ipa: nullIfEmpty(v.ipa),
    context: nullIfEmpty(v.context),
    creatorNotes: nullIfEmpty(v.creatorNotes),
    register: registerPayload(v.register),
    acceptedAnswers: toAcceptedAnswersInput(v.acceptedAnswers),
  };
}

function grammarFieldsPayload(g: GrammarEditorValue) {
  return {
    title: nullIfEmpty(g.title),
    structure: g.structure,
    primaryMeaning: g.primaryMeaning,
    explanation: g.explanation,
    category: nullIfEmpty(g.category),
    creatorNotes: nullIfEmpty(g.creatorNotes),
    requiredQuestions: g.requiredDirections.map((direction: GrammarQuestionDirection) => ({ format: "translation" as const, direction })),
    register: registerPayload(g.register),
    acceptedAnswers: toAcceptedAnswersInput(g.acceptedAnswers),
  };
}

/**
 * Spec 11 rewrite's "Creating Items"/"Vocabulary Editor"/"Grammar Editor",
 * combined into one form: a type selector for a brand-new item (create
 * mode omits it entirely once `existing` is set — an item's type can't
 * change after creation), then the matching field editor. Duplicate
 * detection surfaces inline from the action's structured `DUPLICATE_ITEM`
 * error rather than a separate pre-flight check, since the server is the
 * only place that check can be trusted anyway (never re-implemented
 * client-side).
 */
export function CurriculumItemForm({ languageId, levels, groups, existing, resolvedVocabulary }: CurriculumItemFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<ItemType>(existing?.type ?? "vocabulary");
  const [levelId, setLevelId] = useState(levels[0]?.id ?? "");
  const [vocab, setVocab] = useState<VocabularyEditorValue>(existing?.vocabulary ?? EMPTY_VOCAB);
  const [isResetting, startResetting] = useTransition();

  /**
   * Hands one dictionary-backed field back (spec 17). The server clears the
   * authored mark and re-applies the confirmed match, so the corrected value
   * is read back from a fresh render rather than guessed at here — the same
   * reason nothing else in this form invents server state.
   */
  function resetField(field: DictionaryOverridableField) {
    if (!existing) return;
    startResetting(async () => {
      const result = await resetDictionaryFieldAction({
        learningItemId: existing.learningItemId,
        field,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.ok) router.refresh();
    });
  }
  const [grammar, setGrammar] = useState<GrammarEditorValue>(existing?.grammar ?? EMPTY_GRAMMAR);
  const [error, setError] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<{ learningItemId: string; displayLabel: string }[] | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  function handleSubmit(approvedAsHomonymOf?: string) {
    setError(null);
    startTransition(async () => {
      const fieldsPayload =
        type === "vocabulary" ? { type: "vocabulary" as const, fields: vocabularyFieldsPayload(vocab) } : { type: "grammar" as const, fields: grammarFieldsPayload(grammar) };

      const result = existing
        ? await updateItemAction({ learningItemId: existing.learningItemId, idempotencyKey, approvedAsHomonymOf, ...fieldsPayload })
        : await createItemAction({ languageId, levelId, idempotencyKey, approvedAsHomonymOf, ...fieldsPayload });

      if (!result.ok) {
        if (result.error.code === "DUPLICATE_ITEM") {
          setDuplicateCandidates((result.error.details as { candidates?: typeof duplicateCandidates })?.candidates ?? []);
          return;
        }
        setError(result.error.message);
        return;
      }

      setDuplicateCandidates(null);
      setIdempotencyKey(crypto.randomUUID());
      if (!existing && "learningItemId" in result.data) {
        router.push(`/admin/curriculum/items/${result.data.learningItemId}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-6"
    >
      {!existing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Type</span>
            <Select value={type} onValueChange={(v) => setType(v as ItemType)}>
              <SelectTrigger className="mt-1 w-full" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vocabulary">Vocabulary</SelectItem>
                <SelectItem value="grammar">Grammar</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Level</span>
            <Select value={levelId} onValueChange={setLevelId}>
              <SelectTrigger className="mt-1 w-full" aria-label="Level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    Level {level.levelNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      ) : null}

      {type === "vocabulary" ? (
        <VocabularyEditor
          value={vocab}
          onChange={setVocab}
          groups={groups}
          resolved={resolvedVocabulary}
          onResetField={existing ? resetField : undefined}
          isResetting={isResetting}
        />
      ) : (
        <GrammarEditor value={grammar} onChange={setGrammar} />
      )}

      {duplicateCandidates ? (
        <div className="rounded-xl border border-state-warning bg-state-warning/10 p-4">
          <p className="font-medium text-foreground">This might already exist</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {duplicateCandidates.map((candidate) => (
              <li key={candidate.learningItemId}>{candidate.displayLabel}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDuplicateCandidates(null)}>
              Cancel
            </Button>
            {duplicateCandidates[0] ? (
              <Button type="button" size="sm" onClick={() => handleSubmit(duplicateCandidates[0]!.learningItemId)} disabled={isPending}>
                Approve as separate sense / homonym
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {existing ? "Save" : "Create"}
      </Button>
    </form>
  );
}
