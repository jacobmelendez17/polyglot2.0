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
