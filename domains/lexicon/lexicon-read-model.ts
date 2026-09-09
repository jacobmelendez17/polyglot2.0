import { and, asc, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  learningItemSentences,
  learningItems,
  levels,
  sentences,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { getItemProgress } from "@/domains/progress/repository";
import type { ItemProgress } from "@/domains/progress";

import { composeVocabularyDisplayWord } from "./lexical-language-provider";
import {
  getDictionaryEntryDetail,
  getMapping,
  getSelectedSenseIds,
  getSourceAttribution,
} from "./lexicon-repository";
import type {
  DictionaryEntryDetail,
  DictionaryForm,
  DictionaryPronunciation,
  DictionarySense,
  LexicalAttribution,
  RegionalEvidence,
  VocabularyDictionaryMapping,
} from "./lexicon-types";

/**
 * Spec 12 "Read Model" — the one backend service that composes curriculum +
 * lexicon + regional evidence + progress into what a vocabulary item page
 * needs.
 *
 * Three of spec 12's rules are enforced here rather than left to callers:
 *
 * - **Frontend components must not directly join Drizzle tables.** This is
 *   the join, in one place, returning a view model.
 * - **Raw dictionary JSON is never exposed to ordinary learners.** Nothing
 *   in the returned shape can carry it: `getDictionaryEntryDetail` doesn't
 *   read `dictionary_entry_versions` at all, and raw inspection is a
 *   separate admin-only call.
 * - **Dictionary content stays distinguishable from Polyglot-authored
 *   content.** They are two separate branches of the returned object, each
 *   with its own attribution, so a UI cannot accidentally present a
 *   Wiktionary gloss as Polyglot's teaching explanation.
 *
 * The dictionary half is `null` whenever nothing is mapped — an unmatched
 * item is an ordinary, fully-usable curriculum item, not an error.
 */

export interface VocabularyDetailCurriculum {
  learningItemId: string;
  displayWord: string;
  translation: string;
  /** Polyglot's own learner-facing explanation. A dictionary definition never replaces this (spec 12). */
  teachingSummary: string | null;
  levelNumber: number;
  groupName: string;
  examples: { targetText: string; translation: string }[];
  creatorNotes: string | null;
  /** Admin-authored pronunciation fields, kept as deliberate manual overrides of the dictionary's own. */
  manualPronunciation: string | null;
  manualIpa: string | null;
  partOfSpeech: string;
}

export interface VocabularyDetailDictionary {
  entryId: string;
  lemma: string;
  partOfSpeech: string;
  /** Only the senses an admin explicitly accepted. Empty until someone selects them. */
  selectedSenses: DictionarySense[];
  /** Every sense the entry has, for display alongside the selected ones. */
  allSenses: DictionarySense[];
  pronunciations: DictionaryPronunciation[];
  preferredPronunciationId: string | null;
  forms: DictionaryForm[];
  synonyms: string[];
  variants: string[];
  /** Usage/register labels gathered from the entry's senses, deduplicated. */
  usageLabels: string[];
  regionalEvidence: RegionalEvidence[];
  attribution: LexicalAttribution | null;
  matchStatus: VocabularyDictionaryMapping["matchStatus"];
  confidence: VocabularyDictionaryMapping["confidence"];
}

export interface VocabularyDetail {
  curriculum: VocabularyDetailCurriculum;
  dictionary: VocabularyDetailDictionary | null;
  /** `null` for a signed-out reader, or for a learner who has never enrolled this item. */
  progress: ItemProgress | null;
}

export interface ResolvedVocabularyPresentation {
  /** What's actually shown as the item's teaching meaning — never `vocabulary_items.primaryMeaning` (the short translation graded during quizzes), only the longer explanatory field. */
  definition: string | null;
  definitionSource: "dictionary" | "curriculum" | "none";
  ipa: string | null;
  ipaSource: "dictionary" | "curriculum" | "none";
}

/**
 * The live precedence rule (2026-09-07 product decision, superseding spec
 * 12's original "dictionary content must stay visually separate from the
 * teaching explanation" boundary): once an admin has *confirmed* a
 * vocabulary item's dictionary mapping (`matchStatus === "manual"` —
 * `auto_matched` alone is never enough; an unreviewed guess must never
 * reach a learner), the dictionary's own primary sense and IPA become the
 * effective definition/pronunciation, replacing whatever an admin typed
 * into `vocabulary_items.definition`/`ipa` — confirming a mapping is itself
 * the "use dictionary data instead" action. This is computed fresh from
 * the current mapping every call, never written back into `vocabulary_items`
 * — a later re-import or a changed sense selection is reflected immediately
 * everywhere this is called, with nothing to keep in sync by hand.
 *
 * Deliberately excludes `primaryMeaning`/`translation`: that field is the
 * authoritative graded quiz answer (`domains/srs`'s answer checking), and
 * changing what counts as a correct answer is a distinct, higher-risk
 * decision nobody has made — this resolver only ever touches the
 * explanatory/pronunciation fields.
 */
export function resolveVocabularyPresentation(detail: Pick<VocabularyDetail, "curriculum" | "dictionary">): ResolvedVocabularyPresentation {
  const confirmed = detail.dictionary?.matchStatus === "manual";
  const dictionaryDefinition = confirmed ? (detail.dictionary!.selectedSenses[0]?.gloss ?? null) : null;
  const preferredPronunciation = confirmed
    ? (detail.dictionary!.pronunciations.find((p) => p.id === detail.dictionary!.preferredPronunciationId) ?? detail.dictionary!.pronunciations[0])
    : undefined;
  const dictionaryIpa = preferredPronunciation?.ipa ?? null;

  const definition = dictionaryDefinition ?? detail.curriculum.teachingSummary;
  const ipa = dictionaryIpa ?? detail.curriculum.manualIpa;

  return {
    definition,
    definitionSource: dictionaryDefinition ? "dictionary" : detail.curriculum.teachingSummary ? "curriculum" : "none",
    ipa,
    ipaSource: dictionaryIpa ? "dictionary" : detail.curriculum.manualIpa ? "curriculum" : "none",
  };
}

/**
 * The admin-editor equivalent of {@link resolveVocabularyPresentation},
 * operating directly on a `VocabularyMappingView` (mapping + entry +
 * selected senses) rather than the learner-facing `VocabularyDetail`.
 *
 * `getVocabularyDetail`/`loadCurriculumHalf` deliberately only resolve
 * `published`/`archived` items (see that function's own comment) — a
 * brand-new `pending` item, the common case right after creation, would
 * silently read as "no dictionary data" there even with a confirmed
 * mapping. The admin item page already fetches its mapping view via
 * `getVocabularyMappingView` regardless of the item's status, so this
 * resolver is structurally typed against that shape instead of routing
 * through the status-filtered learner path.
 *
 * Takes the same "confirmed mapping wins" structural shape as
 * `resolveVocabularyPresentation` — see its docstring for the full
 * 2026-09-07 decision this implements.
 */
export function resolveConfirmedDictionaryFields(view: {
  mapping: Pick<VocabularyDictionaryMapping, "matchStatus" | "preferredPronunciationId"> | null;
  entry: Pick<DictionaryEntryDetail, "lemma" | "partOfSpeech" | "senses" | "pronunciations"> | null;
  selectedSenseIds: string[];
}): {
  confirmed: boolean;
  definition: string | null;
  ipa: string | null;
  lemma: string | null;
  /**
   * The entry's part of speech (spec 16 follow-up, 2026-09-09). Included so
   * a confirmed match can fill the curriculum field of the same name, which
   * a bulk import routinely leaves blank — the CSV column is optional and
   * the authored Level 1 file has no such column at all.
   */
  partOfSpeech: string | null;
} {
  const confirmed = view.mapping?.matchStatus === "manual";
  if (!confirmed || !view.entry) return { confirmed: false, definition: null, ipa: null, lemma: null, partOfSpeech: null };

  const primarySenseId = view.selectedSenseIds[0];
  const primarySense = view.entry.senses.find((sense) => sense.id === primarySenseId);
  const preferredPronunciation =
    view.entry.pronunciations.find((p) => p.id === view.mapping!.preferredPronunciationId) ?? view.entry.pronunciations[0];

  return {
    confirmed: true,
    definition: primarySense?.gloss ?? null,
    ipa: preferredPronunciation?.ipa ?? null,
    lemma: view.entry.lemma,
    partOfSpeech: view.entry.partOfSpeech,
  };
}

async function loadCurriculumHalf(
  db: DbClient,
  vocabularyItemId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<VocabularyDetailCurriculum | null> {
  const allowedStatuses = includeArchived ? (["published", "archived"] as const) : (["published"] as const);
  const [row] = await db
    .select({
      learningItemId: vocabularyItems.learningItemId,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      primaryMeaning: vocabularyItems.primaryMeaning,
      definition: vocabularyItems.definition,
      creatorNotes: vocabularyItems.creatorNotes,
      pronunciation: vocabularyItems.pronunciation,
      ipa: vocabularyItems.ipa,
      partOfSpeech: vocabularyItems.partOfSpeech,
      levelNumber: levels.levelNumber,
      groupName: vocabularyGroups.name,
    })
    .from(vocabularyItems)
    .innerJoin(learningItems, eq(learningItems.id, vocabularyItems.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .innerJoin(vocabularyGroups, eq(vocabularyGroups.id, vocabularyItems.vocabularyGroupId))
    // Learner-facing: a draft/pending item must never resolve here, for the
    // same reason it must not appear in a level view — no learner could have
    // organically reached it. `includeArchived` (spec 13: "archived item
    // where still referenceable") is the one deliberate exception: an item a
    // learner already saw or has progress on stays viewable by direct link
    // after archival, even though it no longer appears in level browsing.
    // The level itself is still required to be published — archiving a
    // whole level is a separate, undocumented lifecycle question this
    // doesn't speculate on. Admin surfaces read the item through
    // `domains/curriculum` instead, which exposes its own
    // `includeUnpublished` option covering every status.
    .where(
      and(
        eq(vocabularyItems.learningItemId, vocabularyItemId),
        inArray(learningItems.status, allowedStatuses),
        eq(levels.status, "published"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const exampleRows = await db
    .select({ targetText: sentences.targetText, translation: sentences.translation })
    .from(learningItemSentences)
    .innerJoin(sentences, eq(sentences.id, learningItemSentences.sentenceId))
    .where(and(eq(learningItemSentences.learningItemId, vocabularyItemId), eq(sentences.status, "published")))
    .orderBy(asc(learningItemSentences.position));

  return {
    learningItemId: row.learningItemId,
    displayWord: composeVocabularyDisplayWord(row.term, row.article),
    translation: row.primaryMeaning,
    teachingSummary: row.definition,
    levelNumber: row.levelNumber,
    groupName: row.groupName,
    examples: exampleRows,
    creatorNotes: row.creatorNotes,
    manualPronunciation: row.pronunciation,
    manualIpa: row.ipa,
    partOfSpeech: row.partOfSpeech,
  };
}

async function loadDictionaryHalf(
  db: DbClient,
  vocabularyItemId: string,
): Promise<VocabularyDetailDictionary | null> {
  const mapping = await getMapping(db, vocabularyItemId);
  if (!mapping?.dictionaryEntryId) return null;

  const entry = await getDictionaryEntryDetail(db, mapping.dictionaryEntryId);
  if (!entry) return null;

  const selectedSenseIds = await getSelectedSenseIds(db, vocabularyItemId);
  const senseById = new Map(entry.senses.map((sense) => [sense.id, sense]));

  const attribution = await getSourceAttribution(db, entry.sourceId);

  // Synonyms and alternative spellings are relationships, not curriculum:
  // they are surfaced as evidence and never turned into vocabulary items
  // (spec 12: "Do not create new curriculum items automatically from
  // dictionary forms or synonyms").
  const synonyms = entry.relations
    .filter((relation) => relation.relationType === "synonym" && relation.sourceStatus === "active")
    .map((relation) => relation.targetLemma);
  const variants = entry.relations
    .filter(
      (relation) =>
        (relation.relationType === "alternative_form" || relation.relationType === "form_of") &&
        relation.sourceStatus === "active",
    )
    .map((relation) => relation.targetLemma);

  const usageLabels = [...new Set(entry.senses.flatMap((sense) => [...sense.tags, ...sense.topics]))].sort();

  return {
    entryId: entry.id,
    lemma: entry.lemma,
    partOfSpeech: entry.partOfSpeech,
    // Preserves the admin's chosen order, and silently drops a selection
    // whose sense no longer exists — the mapping is already flagged for
    // review in that case, so the page must not crash on it.
    selectedSenses: selectedSenseIds.map((id) => senseById.get(id)).filter((sense) => sense !== undefined),
    allSenses: entry.senses,
    pronunciations: entry.pronunciations,
    preferredPronunciationId: mapping.preferredPronunciationId,
    forms: entry.forms,
    synonyms,
    variants,
    usageLabels,
    regionalEvidence: entry.regionalEvidence,
    attribution,
    matchStatus: mapping.matchStatus,
    confidence: mapping.confidence,
  };
}

/**
 * The composed vocabulary item projection. `userId` is optional: the same
 * read model serves a signed-out preview and a learner's own item page, and
 * progress is simply absent in the first case rather than a different shape.
 * `includeArchived` defaults to `false` (safe default, matching
 * `domains/curriculum`'s `includeUnpublished` precedent) — spec 13's
 * `/items/[itemId]` page is the one caller that passes `true`, so an
 * archived item a learner already has progress on stays viewable by direct
 * link.
 */
export async function getVocabularyDetail(
  db: DbClient,
  input: { vocabularyItemId: string; userId?: string | null; includeArchived?: boolean },
): Promise<VocabularyDetail | null> {
  const curriculum = await loadCurriculumHalf(db, input.vocabularyItemId, { includeArchived: input.includeArchived });
  if (!curriculum) return null;

  const [dictionary, progress] = await Promise.all([
    loadDictionaryHalf(db, input.vocabularyItemId),
    input.userId ? getItemProgress(db, input.userId, input.vocabularyItemId) : Promise.resolve(null),
  ]);

  return { curriculum, dictionary, progress };
}
