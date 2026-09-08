/**
 * Minimal fixture-backed stand-in for the real `curriculum` domain
 * (architecture.md: not started yet — see progress-tracker.md Next Up #4).
 * Owns only what `domains/lessons` needs to consume per architecture.md's
 * curriculum boundary: vocabulary/grammar content, ordering, and accepted
 * answer variations. Swapping the fixture for a real database-backed
 * implementation later is a one-file change in `curriculum-service.ts`, per
 * the pattern established for `domains/dashboard`.
 */

export type CurriculumExample = {
  targetText: string;
  englishText: string;
};

export type CurriculumResource = {
  label: string;
  url: string;
};

export type Pronunciation = {
  /**
   * Plain-text pronunciation guidance. Optional: `vocabulary_items.pronunciation`
   * is nullable and frequently unset, and inventing a guide from the written
   * form would be worse than showing none.
   */
  guide?: string;
  ipa?: string;
  /**
   * Present only when audio exists. The `media` domain/R2 storage does not
   * exist yet (progress-tracker.md), so this is always absent for now —
   * consumers must degrade to text-only pronunciation per architecture.md's
   * graceful-degradation rule rather than rendering a dead play control.
   */
  audioUrl?: string;
};

/**
 * "Everything the dictionary has" for a confirmed mapping (2026-09-07
 * decision — see `domains/lexicon`'s `resolveVocabularyPresentation`
 * docstring for the full "confirmed mapping wins" rule). Present on a
 * `VocabularyItem` only when its dictionary mapping is confirmed
 * (`matchStatus === "manual"`); absent items simply have no dictionary
 * section during the lesson, same as an unmapped item.
 */
export type VocabularyDictionaryInfo = {
  lemma: string;
  synonyms: string[];
  variants: string[];
  usageLabels: string[];
  regionalEvidence: { regionCode: string; status: "recognized" | "not_listed" | "unknown"; matchedForm: string | null }[];
  attributionText: string | null;
};

export type VocabularyItem = {
  type: "vocabulary";
  id: string;
  languageId: string;
  levelNumber: number;
  /** Ordering within the level, lowest first. Curriculum ordering is explicit and data-driven (architecture.md). */
  lessonPriority: number;
  word: string;
  /** Present only for nouns that require an article, e.g. "el". */
  article?: string;
  partOfSpeech: string;
  /**
   * The effective teaching definition. A confirmed dictionary mapping's
   * primary sense replaces the admin-authored value here (2026-09-07
   * decision) — this is already the *resolved* value by the time a
   * `VocabularyItem` exists, never a raw, unconfirmed dictionary guess.
   */
  definition?: string;
  /** Accepted English meanings; index 0 is the primary meaning — untouched by dictionary resolution (that's the graded quiz answer, a separate decision). */
  meanings: string[];
  /** Additional accepted target-language spellings/synonyms besides `word` itself. */
  targetVariants: string[];
  pronunciation: Pronunciation;
  context?: string;
  examples: CurriculumExample[];
  creatorNotes?: string;
  resources: CurriculumResource[];
  /** Present only when this item has a confirmed dictionary mapping. */
  dictionary?: VocabularyDictionaryInfo;
};

export type GrammarQuestionDirection = "targetToEnglish" | "englishToTarget";

export type GrammarItem = {
  type: "grammar";
  id: string;
  languageId: string;
  levelNumber: number;
  lessonPriority: number;
  structure: string;
  meaning: string;
  explanation: string;
  /**
   * Separate usage guidance, distinct from `explanation`. Optional: the
   * `grammar_items` table has no such column, and `category` is not the same
   * thing — the Details tab omits the section rather than showing a
   * mislabelled value.
   */
  usage?: string;
  context?: string;
  examples: CurriculumExample[];
  creatorNotes?: string;
  resources: CurriculumResource[];
  /**
   * The comprehension-question format(s) this concept is configured for.
   * Only "translation" is defined by the current fixture curriculum; per
   * spec 07 §25, the lesson engine must not invent an unconfigured format.
   */
  requiredQuestions: { format: "translation"; direction: GrammarQuestionDirection }[];
};

export type LearningItem = VocabularyItem | GrammarItem;
