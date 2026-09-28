import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ArchiveDeleteDialog } from "@/components/admin/curriculum/archive-delete-dialog";
import { CurriculumItemForm } from "@/components/admin/curriculum/curriculum-item-form";
import { CurriculumStatusBadge } from "@/components/admin/curriculum/curriculum-status-badge";
import type { GrammarEditorValue } from "@/components/admin/curriculum/grammar-editor";
import {
  GuardedLink,
  ItemEditorGuardProvider,
} from "@/components/admin/curriculum/item-editor-guard";
import { PublishDialog } from "@/components/admin/curriculum/publish-dialog";
import type { VocabularyEditorValue } from "@/components/admin/curriculum/vocabulary-editor";
import { DictionaryMappingPanel } from "@/components/admin/dictionary/dictionary-mapping-panel";
import { UsageContextEditor } from "@/components/admin/curriculum/usage-context-editor";
import { toRegisterEditorValue } from "@/components/admin/curriculum/register-value";
import { splitAcceptedAnswers } from "@/components/admin/curriculum/accepted-answers-value";
import type { Register } from "@/db/schema";
import { canManageCurriculum } from "@/domains/admin";
import type {
  AcceptedAnswerInput,
  AdminCurriculumNeedsFilter,
  CurriculumLearningItem,
  CurriculumStatus,
} from "@/domains/curriculum";
import {
  getAcceptedAnswers,
  getAdjacentAdminCurriculumItem,
  getItemDraft,
  getItemExamples,
  getLanguageById,
  getLearningItem,
  getLevelById,
  getLevelsByLanguage,
  getUsageContexts,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/server";
import {
  composeVocabularyDisplayWord,
  deriveDictionaryRelationAnswers,
  resolveConfirmedDictionaryFields,
} from "@/domains/lexicon";
import { getVocabularyMappingView } from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ itemId: string }>;
}): Promise<Metadata> {
  const { itemId } = await params;
  const item = await getLearningItem(itemId);
  const label = item
    ? item.type === "vocabulary"
      ? item.vocabulary.term
      : item.grammar.structure
    : "Item";
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

function toVocabularyFormValue(
  detail: VocabularyDetailLike,
  acceptedAnswers: AcceptedAnswerInput[],
): VocabularyEditorValue {
  const { synonyms, variants } = splitAcceptedAnswers(acceptedAnswers);
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
    synonyms,
    variants,
  };
}

function toGrammarFormValue(
  detail: GrammarDetailLike,
  acceptedAnswers: AcceptedAnswerInput[],
): GrammarEditorValue {
  return {
    title: detail.title ?? "",
    structure: detail.structure,
    primaryMeaning: detail.primaryMeaning,
    explanation: detail.explanation,
    category: detail.category ?? "",
    creatorNotes: detail.creatorNotes ?? "",
    register: toRegisterEditorValue(detail.register),
    requiredDirections: detail.requiredQuestions.map((q) => q.direction),
    // Grammar has no Variants field — see GrammarEditorValue's docstring.
    // A term-side row is never authored for a grammar item, but this drops
    // one silently rather than crashing if one somehow exists.
    synonyms: splitAcceptedAnswers(acceptedAnswers).synonyms,
  };
}

const STATUSES = ["draft", "pending", "published", "archived"] as const;
const NEEDS_FILTERS = [
  "definition",
  "examples",
  "ipa",
  "pronunciation",
  "synonyms",
  "variations",
  "draft_changes",
  "ready_to_publish",
] as const;

/**
 * Spec 25 §16 — the list's own filters, carried through by `from` (see this
 * page's own docstring on `backHref`), parsed back into the shape
 * `getAdjacentAdminCurriculumItem` needs so "Previous"/"Next"/"Next
 * Incomplete Item" mean the same thing the list the admin actually came
 * from would show — never a separately-derived, potentially different
 * ordering. Falls back to the current item's own language when `from` is
 * absent (a direct link, not a click-through from the list).
 */
function parseAdjacentFilters(
  from: string | undefined,
  fallbackLanguageId: string,
) {
  const params = new URLSearchParams(from ?? "");
  const type = params.get("type");
  const status = params.get("status");
  const needs = params.get("needs");
  return {
    languageId: params.get("language") ?? fallbackLanguageId,
    levelId: params.get("level") ?? undefined,
    type:
      type === "vocabulary" || type === "grammar"
        ? (type as "vocabulary" | "grammar")
        : undefined,
    status: STATUSES.includes(status as CurriculumStatus)
      ? (status as CurriculumStatus)
      : undefined,
    groupId: params.get("group") ?? undefined,
    search: params.get("search") ?? undefined,
    needs: NEEDS_FILTERS.includes(needs as (typeof NEEDS_FILTERS)[number])
      ? (needs as AdminCurriculumNeedsFilter)
      : undefined,
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
export default async function EditCurriculumItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const { itemId } = await params;
  const { from } = await searchParams;
  // The curriculum list's own filters/search/pagination, carried through by
  // its row links (see CurriculumTable) so following a row here and then
  // going back restores that exact view instead of a blank one — the
  // sidebar's plain "Curriculum" link has no `from` and still resets.
  const backHref = from ? `/admin/curriculum?${from}` : "/admin/curriculum";
  const item: CurriculumLearningItem | null = await getLearningItem(itemId);
  if (!item) notFound();

  const currentLevel = await getLevelById(item.levelId);
  const adjacentFilters = parseAdjacentFilters(from, item.languageId);
  const adjacentBase = {
    ...adjacentFilters,
    currentLevelNumber: currentLevel?.levelNumber ?? 0,
    currentPosition: item.position,
    currentId: item.id,
  };

  const [
    liveAcceptedAnswers,
    draft,
    levels,
    groups,
    mappingView,
    usageContexts,
    examples,
    previousItem,
    nextItem,
    nextIncompleteItem,
    language,
  ] = await Promise.all([
    getAcceptedAnswers(itemId),
    getItemDraft(itemId),
    getLevelsByLanguage(item.languageId),
    getVocabularyGroupsByLanguage(item.languageId),
    // Spec 12 — the dictionary half of the editor. Vocabulary only:
    // dictionary integration applies to vocabulary, not grammar.
    item.type === "vocabulary"
      ? getVocabularyMappingView(itemId)
      : Promise.resolve(null),
    getUsageContexts(itemId),
    getItemExamples(itemId),
    // Spec 25 §16 — "Previous"/"Next"/"Next Incomplete Item," scoped to
    // whatever filters `from` carries (the same view the admin came from).
    getAdjacentAdminCurriculumItem({ ...adjacentBase, direction: "previous" }),
    getAdjacentAdminCurriculumItem({ ...adjacentBase, direction: "next" }),
    getAdjacentAdminCurriculumItem({
      ...adjacentBase,
      direction: "next",
      anyIncomplete: true,
    }),
    // Spec 25 §17's breadcrumb ("Curriculum > Spanish > Level 2 > ...").
    getLanguageById(item.languageId),
  ]);

  const itemHref = (id: string) =>
    from
      ? `/admin/curriculum/items/${id}?from=${from}`
      : `/admin/curriculum/items/${id}`;
  const previousHref = previousItem ? itemHref(previousItem.id) : null;
  const nextHref = nextItem ? itemHref(nextItem.id) : null;
  const nextIncompleteHref = nextIncompleteItem
    ? itemHref(nextIncompleteItem.id)
    : null;

  // Deliberately not `getVocabularyDetail`/`resolveVocabularyPresentation`:
  // that learner-facing path only resolves published/archived items (see
  // its own docstring), so a brand-new `pending` item — the common case
  // right after creation — would read as "no dictionary data" even with a
  // confirmed mapping. `resolveConfirmedDictionaryFields` works directly
  // off the mapping view above, which this page already fetches
  // regardless of item status.
  // Same "confirmed only" rule as every other dictionary-sourced field on
  // this page: an unreviewed auto-match is never shown, even as read-only
  // reference text — spec 13's "an unreviewed guess must never reach a
  // learner" extends here to "must never look like it's already covered".
  const dictionaryReference =
    mappingView?.entry && mappingView.mapping?.matchStatus === "manual"
      ? (() => {
          const { synonyms, variants } = deriveDictionaryRelationAnswers(
            mappingView.entry,
          );
          return {
            dictionarySynonyms: synonyms,
            // Matches `officialVariations`'s own merge in
            // domains/curriculum/item-detail-service.ts — forms fold into
            // what a learner sees as a Variation, relations alone don't.
            dictionaryVariants: [
              ...new Set([
                ...variants,
                ...mappingView.entry.forms.map((form) => form.form),
              ]),
            ],
          };
        })()
      : { dictionarySynonyms: [], dictionaryVariants: [] };

  const resolvedVocabulary =
    mappingView && item.type === "vocabulary"
      ? {
          ...resolveConfirmedDictionaryFields(mappingView),
          overrides: item.vocabulary.dictionaryFieldOverrides,
          ...dictionaryReference,
        }
      : undefined;

  const levelNumberById = new Map(
    levels.map((level) => [level.id, level.levelNumber]),
  );
  const groupOptions = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      levelNumber: levelNumberById.get(group.levelId) ?? 0,
    }))
    .sort(
      (a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name),
    );

  const itemLabel =
    item.type === "vocabulary" ? item.vocabulary.term : item.grammar.structure;
  const isDraftEdit = draft !== null;

  // Spec 25 §17 — "Curriculum > Spanish > Level 2 > Food & Drinks > gato."
  // Each segment links to the same list filters a click-through from that
  // level/group would use, so following one behaves exactly like navigating
  // there from the list itself. Grammar has no group, so that segment is
  // simply omitted rather than shown empty.
  const currentGroupId =
    item.type === "vocabulary" ? item.vocabulary.vocabularyGroupId : null;
  const currentGroupName =
    currentGroupId != null
      ? (groups.find((g) => g.id === currentGroupId)?.name ?? null)
      : null;
  const breadcrumbs: { label: string; href: string }[] = [
    { label: "Curriculum", href: "/admin/curriculum" },
    {
      label: language?.name ?? "Language",
      href: `/admin/curriculum?language=${item.languageId}`,
    },
    {
      label: `Level ${currentLevel?.levelNumber ?? "?"}`,
      href: `/admin/curriculum?language=${item.languageId}&level=${item.levelId}`,
    },
    ...(currentGroupName
      ? [
          {
            label: currentGroupName,
            href: `/admin/curriculum?language=${item.languageId}&level=${item.levelId}&group=${currentGroupId}`,
          },
        ]
      : []),
  ];

  const existing =
    item.type === "vocabulary"
      ? {
          learningItemId: item.id,
          type: "vocabulary" as const,
          vocabulary:
            draft?.data.type === "vocabulary"
              ? toVocabularyFormValue(
                  draft.data.fields,
                  draft.data.fields.acceptedAnswers,
                )
              : toVocabularyFormValue(item.vocabulary, liveAcceptedAnswers),
        }
      : {
          learningItemId: item.id,
          type: "grammar" as const,
          grammar:
            draft?.data.type === "grammar"
              ? toGrammarFormValue(
                  draft.data.fields,
                  draft.data.fields.acceptedAnswers,
                )
              : toGrammarFormValue(item.grammar, liveAcceptedAnswers),
        };

  return (
    <ItemEditorGuardProvider>
      <div>
        {/* Spec 25 §17's breadcrumb trail. */}
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.href} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">›</span> : null}
              <GuardedLink
                href={crumb.href}
                className="text-primary underline-offset-4 hover:underline"
              >
                {crumb.label}
              </GuardedLink>
            </span>
          ))}
          <span aria-hidden="true">›</span>
          <span aria-current="page">{itemLabel}</span>
        </nav>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <GuardedLink
            href={backHref}
            className="inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            ← Return to Results
          </GuardedLink>
          {/* Spec 25 §16 — plain navigation only; a save happens through the
              form below (see its own "Save & Next"). */}
          <div className="flex items-center gap-3 text-sm">
            {previousHref ? (
              <GuardedLink
                href={previousHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                ← Previous
              </GuardedLink>
            ) : (
              <span className="text-muted-foreground">← Previous</span>
            )}
            {nextHref ? (
              <GuardedLink
                href={nextHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                Next →
              </GuardedLink>
            ) : (
              <span className="text-muted-foreground">Next →</span>
            )}
            {nextIncompleteHref ? (
              <GuardedLink
                href={nextIncompleteHref}
                className="text-primary underline-offset-4 hover:underline"
              >
                Next Incomplete Item →
              </GuardedLink>
            ) : null}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <AdminPageHeader
            title={itemLabel}
            description={
              item.type === "vocabulary" ? "Vocabulary item" : "Grammar item"
            }
          />
          <div className="flex items-center gap-2">
            <CurriculumStatusBadge
              status={isDraftEdit ? "draft" : item.status}
            />
            {item.status !== "archived" ? (
              <PublishDialog
                learningItemId={item.id}
                itemLabel={itemLabel}
                expectedVersion={item.version}
                isDraftEdit={isDraftEdit}
              />
            ) : null}
            <ArchiveDeleteDialog
              learningItemId={item.id}
              itemLabel={itemLabel}
            />
          </div>
        </div>

        <CurriculumItemForm
          languageId={item.languageId}
          levels={levels.map((l) => ({ id: l.id, levelNumber: l.levelNumber }))}
          groups={groupOptions}
          existing={existing}
          resolvedVocabulary={resolvedVocabulary}
          nextHref={nextHref}
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
            canSeedFromDictionary={
              mappingView?.mapping?.matchStatus === "manual" &&
              mappingView.entry !== null
            }
          />
        </div>

        {item.type === "vocabulary" && mappingView ? (
          <div className="mt-6">
            <DictionaryMappingPanel
              vocabularyItemId={item.id}
              languageId={item.languageId}
              displayWord={composeVocabularyDisplayWord(
                item.vocabulary.term,
                item.vocabulary.article,
              )}
              mapping={mappingView.mapping}
              entry={mappingView.entry}
              selectedSenseIds={mappingView.selectedSenseIds}
              attributionText={mappingView.attributionText}
            />
          </div>
        ) : null}
      </div>
    </ItemEditorGuardProvider>
  );
}
