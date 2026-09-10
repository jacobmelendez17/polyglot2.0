import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ArchiveDeleteDialog } from "@/components/admin/curriculum/archive-delete-dialog";
import { CurriculumItemForm } from "@/components/admin/curriculum/curriculum-item-form";
import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import type { GrammarEditorValue } from "@/components/admin/curriculum/grammar-editor";
import { PublishDialog } from "@/components/admin/curriculum/publish-dialog";
import type { VocabularyEditorValue } from "@/components/admin/curriculum/vocabulary-editor";
import { DictionaryMappingPanel } from "@/components/admin/dictionary/dictionary-mapping-panel";
import { UsageContextEditor } from "@/components/admin/curriculum/usage-context-editor";
import { toRegisterEditorValue } from "@/components/admin/curriculum/register-value";
import type { Register } from "@/db/schema";
import { canManageCurriculum } from "@/domains/admin";
import type { AcceptedAnswerInput, CurriculumLearningItem } from "@/domains/curriculum";
import {
  getAcceptedAnswers,
  getItemDraft,
  getItemExamples,
  getLearningItem,
  getLevelsByLanguage,
  getUsageContexts,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import { composeVocabularyDisplayWord, resolveConfirmedDictionaryFields } from "@/domains/lexicon";
import { getVocabularyMappingView } from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";

export async function generateMetadata({ params }: { params: Promise<{ itemId: string }> }): Promise<Metadata> {
  const { itemId } = await params;
  const item = await getLearningItem(itemId);
  const label = item ? (item.type === "vocabulary" ? item.vocabulary.term : item.grammar.structure) : "Item";
  return { title: `${label} — Polyglot Admin` };
}

/**
 * Accepts either the live `CurriculumVocabularyDetail` read shape or a
 * draft's `VocabularyFieldsInput` snapshot — the two differ only in
 * whether an absent optional field reads as `null` or `undefined`, and
 * `?? ""` already treats them identically.
 */
type VocabularyDetailLike = {
  vocabularyGroupId: string;
  term: string;
  primaryMeaning: string;
  definition?: string | null;
  article?: string | null;
  partOfSpeech: string;
  pronunciation?: string | null;
  ipa?: string | null;
  context?: string | null;
  creatorNotes?: string | null;
  register?: Register | null;
};

type GrammarDetailLike = {
  title?: string | null;
  structure: string;
  primaryMeaning: string;
  explanation: string;
  category?: string | null;
  creatorNotes?: string | null;
  register?: Register | null;
  requiredQuestions: { direction: "targetToEnglish" | "englishToTarget" }[];
};

function toVocabularyFormValue(detail: VocabularyDetailLike, acceptedAnswers: AcceptedAnswerInput[]): VocabularyEditorValue {
  return {
    vocabularyGroupId: detail.vocabularyGroupId,
    term: detail.term,
    primaryMeaning: detail.primaryMeaning,
    definition: detail.definition ?? "",
    article: detail.article ?? "",
    partOfSpeech: detail.partOfSpeech,
    pronunciation: detail.pronunciation ?? "",
    ipa: detail.ipa ?? "",
    context: detail.context ?? "",
    creatorNotes: detail.creatorNotes ?? "",
    register: toRegisterEditorValue(detail.register),
    acceptedAnswers,
  };
}

function toGrammarFormValue(detail: GrammarDetailLike, acceptedAnswers: AcceptedAnswerInput[]): GrammarEditorValue {
  return {
    title: detail.title ?? "",
    structure: detail.structure,
    primaryMeaning: detail.primaryMeaning,
    explanation: detail.explanation,
    category: detail.category ?? "",
    creatorNotes: detail.creatorNotes ?? "",
    register: toRegisterEditorValue(detail.register),
    requiredDirections: detail.requiredQuestions.map((q) => q.direction),
    acceptedAnswers,
  };
}

/**
 * Spec 11 rewrite's item edit page — reads whichever content is actually
 * current: if an open draft exists (an edit-in-progress on an already-
 * published item), the form shows *that*, so the admin continues their
 * in-progress edit rather than blindly overwriting it with the still-live
 * content. A brand-new (`pending`) item has no draft, and the form edits
 * its live row directly (see `learning_items.status`'s own default-value
 * comment for why that's safe). The draft's own accepted answers aren't
 * separately staged (see `curriculum_item_drafts`'s docstring — the draft
 * is a full field snapshot, not a diff), so its `data.fields.acceptedAnswers`
 * is used as-is instead of the live `getAcceptedAnswers` result.
 */
export default async function EditCurriculumItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { itemId } = await params;
  const item: CurriculumLearningItem | null = await getLearningItem(itemId);
  if (!item) notFound();

  const [liveAcceptedAnswers, draft, levels, groups, mappingView, usageContexts, examples] = await Promise.all([
    getAcceptedAnswers(itemId),
    getItemDraft(itemId),
    getLevelsByLanguage(item.languageId),
    getVocabularyGroupsByLanguage(item.languageId),
    // Spec 12 — the dictionary half of the editor. Vocabulary only:
    // dictionary integration applies to vocabulary, not grammar.
    item.type === "vocabulary" ? getVocabularyMappingView(itemId) : Promise.resolve(null),
    getUsageContexts(itemId),
    getItemExamples(itemId),
  ]);

  // Deliberately not `getVocabularyDetail`/`resolveVocabularyPresentation`:
  // that learner-facing path only resolves published/archived items (see
  // its own docstring), so a brand-new `pending` item — the common case
  // right after creation — would read as "no dictionary data" even with a
  // confirmed mapping. `resolveConfirmedDictionaryFields` works directly
  // off the mapping view above, which this page already fetches
  // regardless of item status.
  const resolvedVocabulary =
    mappingView && item.type === "vocabulary"
      ? { ...resolveConfirmedDictionaryFields(mappingView), overrides: item.vocabulary.dictionaryFieldOverrides }
      : undefined;

  const levelNumberById = new Map(levels.map((level) => [level.id, level.levelNumber]));
  const groupOptions = groups
    .map((group) => ({ id: group.id, name: group.name, levelNumber: levelNumberById.get(group.levelId) ?? 0 }))
    .sort((a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name));

  const itemLabel = item.type === "vocabulary" ? item.vocabulary.term : item.grammar.structure;
  const isDraftEdit = draft !== null;

  const existing =
    item.type === "vocabulary"
      ? {
          learningItemId: item.id,
          type: "vocabulary" as const,
          vocabulary:
            draft?.data.type === "vocabulary"
              ? toVocabularyFormValue(draft.data.fields, draft.data.fields.acceptedAnswers)
              : toVocabularyFormValue(item.vocabulary, liveAcceptedAnswers),
        }
      : {
          learningItemId: item.id,
          type: "grammar" as const,
          grammar:
            draft?.data.type === "grammar"
              ? toGrammarFormValue(draft.data.fields, draft.data.fields.acceptedAnswers)
              : toGrammarFormValue(item.grammar, liveAcceptedAnswers),
        };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title={itemLabel} description={item.type === "vocabulary" ? "Vocabulary item" : "Grammar item"} />
        <div className="flex items-center gap-2">
          <CurriculumStatusBadge status={isDraftEdit ? "draft" : item.status} />
          {item.status !== "archived" ? (
            <PublishDialog learningItemId={item.id} itemLabel={itemLabel} expectedVersion={item.version} isDraftEdit={isDraftEdit} />
          ) : null}
          <ArchiveDeleteDialog learningItemId={item.id} itemLabel={itemLabel} />
        </div>
      </div>

      <CurriculumItemForm
        languageId={item.languageId}
        levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
        groups={groupOptions}
        existing={existing}
        resolvedVocabulary={resolvedVocabulary}
      />

      <div className="mt-8">
        <UsageContextEditor
          learningItemId={item.id}
          itemType={item.type}
          contexts={usageContexts}
          examples={examples.map((example) => ({
            id: example.id,
            usageContextId: example.usageContextId,
            position: example.position,
            targetText: example.targetText,
            translation: example.translation,
          }))}
          canSeedFromDictionary={mappingView?.mapping?.matchStatus === "manual" && mappingView.entry !== null}
        />
      </div>

      {item.type === "vocabulary" && mappingView ? (
        <div className="mt-6">
          <DictionaryMappingPanel
            vocabularyItemId={item.id}
            languageId={item.languageId}
            displayWord={composeVocabularyDisplayWord(item.vocabulary.term, item.vocabulary.article)}
            mapping={mappingView.mapping}
            entry={mappingView.entry}
            selectedSenseIds={mappingView.selectedSenseIds}
            attributionText={mappingView.attributionText}
          />
        </div>
      ) : null}
    </div>
  );
}
