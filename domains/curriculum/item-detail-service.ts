import { db } from "@/db/client";
import {
  composeVocabularyDisplayWord,
  getLexicalLanguageProvider,
  resolveVocabularyPresentation,
} from "@/domains/lexicon";
import { getVocabularyDetail } from "@/domains/lexicon/server";
import { getSynonyms } from "@/domains/learner-content/server";
import { getItemProgress, getLevelProgress } from "@/domains/progress/server";
import type { ItemProgress } from "@/domains/progress";

import {
  getAcceptedAnswers as repoGetAcceptedAnswers,
  getDraft as repoGetDraft,
  getItemExamples as repoGetItemExamples,
  getUsageContexts as repoGetUsageContexts,
} from "./curriculum-mutation-repository";
import * as repository from "./curriculum-repository";
import type { AcceptedAnswerInput } from "./curriculum-mutation-types";
import type {
  CurriculumGrammarContentBlock,
  CurriculumItemResource,
  CurriculumLearningItem,
  CurriculumStatus,
} from "./curriculum-db-types";
import type {
  ItemDetailExampleSource,
  ItemDetailPatternSource,
  ItemDetailSource,
  ItemNavigationView,
} from "./item-detail-view";
import { buildItemNavigation } from "./item-detail-view";

/**
 * The server-side read model behind spec 18's item page — one composition
 * that assembles everything the shared item-detail components need, so the
 * page itself stays thin and no component re-queries curriculum or Lexicon
 * data the page already loaded (spec 18's "use server-side item read
 * models" / "avoid duplicate curriculum/Lexicon queries").
 *
 * Reads only. Every learner action and admin edit goes through its own
 * service; nothing here mutates.
 *
 * Cross-domain reads go through each domain's public server surface —
 * `domains/lexicon` for the composed vocabulary read model, `domains/progress`
 * for SRS state, `domains/learner-content` for the reader's own private
 * synonyms — never by joining another domain's tables here. This module
 * lives in `domains/curriculum` because the item *is* curriculum content;
 * `curriculum-db-service.ts` already depends on `domains/lexicon/server`
 * for the same reason.
 */

export type ItemDetailPageData = {
  source: ItemDetailSource;
  navigation: ItemNavigationView | null;
  status: CurriculumStatus;
  /** For the "back to where I came from" link and the vocabulary hero's scope. */
  levelNumber: number;
  groupName: string | null;
  /** BCP-47-ish `languages.code`, so pronunciation playback can pick a voice for the right language. */
  languageCode: string;
  progress: ItemProgress | null;
  /**
   * When this learner unlocked the item's level — spec 18's "Unlock Date".
   * An item becomes reachable exactly when its level does, and level unlock
   * is the only unlock event `domains/progress` records, so this is the real
   * date rather than a stand-in. `null` for a level the learner has not
   * unlocked.
   */
  levelUnlockedAt: Date | null;
};

/** Learner-visible statuses. Matches the item page's existing rule: a draft/pending item has never been shown to a learner, so it reads as missing. */
const VIEWABLE_STATUSES: ReadonlySet<CurriculumStatus> =
  new Set<CurriculumStatus>(["published", "archived"]);

function toPatternSources(
  contexts: { id: string; label: string; note: string | null }[],
): ItemDetailPatternSource[] {
  return contexts.map((context) => ({
    id: context.id,
    label: context.label,
    note: context.note,
  }));
}

function toExampleSources(
  examples: {
    id: string;
    usageContextId: string | null;
    targetText: string;
    translation: string;
  }[],
): ItemDetailExampleSource[] {
  return examples.map((example) => ({
    id: example.id,
    targetText: example.targetText,
    translation: example.translation,
    patternId: example.usageContextId,
  }));
}

/** Case-insensitive dedupe that keeps the first spelling seen — two sources can offer the same synonym with different casing. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

/**
 * Everything spec 18's item page renders, or `null` when the id resolves to
 * nothing a learner may see.
 *
 * Queries fan out with `Promise.all` rather than running in sequence: they
 * are independent reads of a single item, and an item page that awaited each
 * in turn would pay the round-trip cost of all of them added together.
 */
export async function getItemDetailPageData(
  itemId: string,
  userId: string,
): Promise<ItemDetailPageData | null> {
  const item = await repository.getLearningItem(db, itemId);
  if (!item || !VIEWABLE_STATUSES.has(item.status)) return null;

  const [
    level,
    language,
    patterns,
    examples,
    resources,
    acceptedAnswers,
    personalSynonyms,
  ] = await Promise.all([
    repository.getLevelById(db, item.levelId),
    repository.getLanguageById(db, item.languageId),
    repoGetUsageContexts(db, itemId),
    repoGetItemExamples(db, itemId),
    repository.getItemResources(db, itemId),
    repoGetAcceptedAnswers(db, itemId),
    getSynonyms(userId, itemId),
  ]);

  if (!level) {
    throw new Error(
      `Data integrity error: learning item ${itemId} references level ${item.levelId}, which does not exist.`,
    );
  }
  if (!language) {
    throw new Error(
      `Data integrity error: learning item ${itemId} references language ${item.languageId}, which does not exist.`,
    );
  }

  // Official accepted answers split by the side they are accepted for, the
  // same distinction `user_synonyms` uses: a `meaning`-side answer is an
  // English synonym, a `term`-side answer is another accepted spelling of
  // the word itself. That is exactly spec 18's Synonyms/Variations split, so
  // no second classification is invented here.
  const officialMeaningAnswers = acceptedAnswers
    .filter((answer) => answer.side === "meaning")
    .map((answer) => answer.value);
  const officialTermAnswers = acceptedAnswers
    .filter((answer) => answer.side === "term")
    .map((answer) => answer.value);
  const personalMeaningSynonyms = personalSynonyms
    .filter((synonym) => synonym.side === "meaning")
    .map((synonym) => synonym.value);
  const personalTermSynonyms = personalSynonyms
    .filter((synonym) => synonym.side === "term")
    .map((synonym) => synonym.value);

  const [levelProgress, siblingIds] = await Promise.all([
    getLevelProgress(userId, item.levelId),
    repository.getSiblingItemIds(
      db,
      item,
      item.type === "vocabulary" ? item.vocabulary.vocabularyGroupId : null,
    ),
  ]);

  const shared = {
    itemId: item.id,
    levelNumber: level.levelNumber,
    cefrLevel: level.cefrLevel,
    register:
      item.type === "vocabulary"
        ? item.vocabulary.register
        : item.grammar.register,
    patterns: toPatternSources(patterns),
    examples: toExampleSources(examples),
    resources: resources.map((resource) => ({
      id: resource.id,
      label: resource.label,
      url: resource.url,
    })),
  };

  if (item.type === "grammar") {
    const [blocks, progress] = await Promise.all([
      repository.getGrammarContentBlocks(db, itemId),
      getItemProgress(userId, itemId),
    ]);

    return {
      source: {
        ...shared,
        type: "grammar",
        structure: item.grammar.structure,
        title: item.grammar.title,
        translation: item.grammar.primaryMeaning,
        explanation: item.grammar.explanation,
        blocks,
        officialSynonyms: dedupe(officialMeaningAnswers),
        personalSynonyms: dedupe(personalMeaningSynonyms),
      },
      navigation: buildItemNavigation(
        siblingIds,
        itemId,
        `Level ${level.levelNumber} grammar`,
      ),
      status: item.status,
      levelNumber: level.levelNumber,
      groupName: null,
      languageCode: language.code,
      progress,
      levelUnlockedAt: levelProgress?.unlockedAt ?? null,
    };
  }

  // Vocabulary composes `domains/lexicon`'s existing read model rather than
  // re-joining curriculum to the dictionary here (spec 13's rule, unchanged)
  // — it is also what carries the "confirmed mapping wins" resolution and
  // the item's own progress row, so no separate progress query is issued.
  const detail = await getVocabularyDetail({
    vocabularyItemId: itemId,
    userId,
    includeArchived: true,
  });
  if (!detail) return null;

  const resolved = resolveVocabularyPresentation(detail);
  // An unreviewed auto-match must never reach a learner (spec 13) — only a
  // human-confirmed mapping contributes synonyms, variants, or audio.
  const confirmedDictionary =
    detail.dictionary?.matchStatus === "manual" ? detail.dictionary : null;
  const preferredPronunciation = confirmedDictionary
    ? (confirmedDictionary.pronunciations.find(
        (pronunciation) =>
          pronunciation.id === confirmedDictionary.preferredPronunciationId,
      ) ?? confirmedDictionary.pronunciations[0])
    : undefined;

  const provider = getLexicalLanguageProvider(language.code);

  return {
    source: {
      ...shared,
      type: "vocabulary",
      displayWord: composeVocabularyDisplayWord(
        item.vocabulary.term,
        item.vocabulary.article,
      ),
      translation: item.vocabulary.primaryMeaning,
      gender: provider.grammaticalGenderForArticle(item.vocabulary.article),
      wordType:
        confirmedDictionary?.partOfSpeech ?? item.vocabulary.partOfSpeech,
      pronunciationGuide: item.vocabulary.pronunciation,
      ipa: resolved.ipa,
      audioUrl: preferredPronunciation?.audioUrl ?? null,
      teachingDefinition: resolved.definition,
      officialSynonyms: dedupe([
        ...(confirmedDictionary?.synonyms ?? []),
        ...officialMeaningAnswers,
      ]),
      personalSynonyms: dedupe(personalMeaningSynonyms),
      officialVariations: dedupe([
        ...(confirmedDictionary?.variants ?? []),
        ...(confirmedDictionary?.forms.map((form) => form.form) ?? []),
        ...officialTermAnswers,
      ]),
      personalVariations: dedupe(personalTermSynonyms),
    },
    navigation: buildItemNavigation(
      siblingIds,
      itemId,
      detail.curriculum.groupName,
    ),
    status: item.status,
    levelNumber: level.levelNumber,
    groupName: detail.curriculum.groupName,
    languageCode: language.code,
    progress: detail.progress,
    levelUnlockedAt: levelProgress?.unlockedAt ?? null,
  };
}

/**
 * Everything the item page's admin editing controls need (spec 18), loaded
 * only for a viewer who may actually manage curriculum.
 *
 * A separate function from {@link getItemDetailPageData}, not extra fields on
 * it, so an ordinary learner's item page pays nothing for a capability they
 * do not have — the editors need the item's raw editable fields, the group
 * list, the accepted answers, and the open draft, none of which a learner
 * ever sees.
 *
 * Returning this is not authorization. The caller checks the role before
 * asking, and every mutation the editors invoke re-checks it server-side.
 */
export type ItemAdminEditingData = {
  item: CurriculumLearningItem;
  acceptedAnswers: AcceptedAnswerInput[];
  /** Vocabulary groups in the item's language, already annotated with their level number and ordered for a picker. */
  groups: { id: string; name: string; levelNumber: number }[];
  blocks: CurriculumGrammarContentBlock[];
  patterns: {
    id: string;
    label: string;
    note: string | null;
    position: number;
    sourceForm: string | null;
  }[];
  examples: {
    id: string;
    usageContextId: string | null;
    position: number;
    targetText: string;
    translation: string;
  }[];
  resources: CurriculumItemResource[];
  /** True when an unpublished edit is staged against this item — the page warns that what it shows is not what learners see. */
  hasOpenDraft: boolean;
};

export async function getItemAdminEditingData(
  itemId: string,
): Promise<ItemAdminEditingData | null> {
  const item = await repository.getLearningItem(db, itemId);
  if (!item) return null;

  const [
    acceptedAnswers,
    groups,
    levels,
    blocks,
    patterns,
    examples,
    resources,
    draft,
  ] = await Promise.all([
    repoGetAcceptedAnswers(db, itemId),
    repository.getVocabularyGroupsByLanguage(db, item.languageId),
    repository.getLevelsByLanguage(db, item.languageId),
    item.type === "grammar"
      ? repository.getGrammarContentBlocks(db, itemId)
      : Promise.resolve([]),
    repoGetUsageContexts(db, itemId),
    repoGetItemExamples(db, itemId),
    repository.getItemResources(db, itemId),
    repoGetDraft(db, itemId),
  ]);

  // The group picker labels each option by its level, so the level lookup
  // happens once here rather than in the component that renders it.
  const levelNumberById = new Map(
    levels.map((level) => [level.id, level.levelNumber]),
  );

  return {
    item,
    acceptedAnswers,
    groups: groups
      .map((group) => ({
        id: group.id,
        name: group.name,
        levelNumber: levelNumberById.get(group.levelId) ?? 0,
      }))
      .sort(
        (a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name),
      ),
    blocks,
    patterns: patterns.map((pattern) => ({
      id: pattern.id,
      label: pattern.label,
      note: pattern.note,
      position: pattern.position,
      sourceForm: pattern.sourceForm,
    })),
    examples,
    resources,
    hasOpenDraft: draft !== null,
  };
}
