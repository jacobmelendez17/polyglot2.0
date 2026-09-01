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
  /** Plain-text pronunciation guidance, always present. */
  guide: string;
  ipa?: string;
  /**
   * Present only when audio exists. The `media` domain/R2 storage does not
   * exist yet (progress-tracker.md), so this is always absent for now —
   * consumers must degrade to text-only pronunciation per architecture.md's
   * graceful-degradation rule rather than rendering a dead play control.
   */
  audioUrl?: string;
};

export type VocabularyItem = {
  type: "vocabulary";
  id: string;
  languageId: string;
  levelId: number;
  /** Ordering within the level, lowest first. Curriculum ordering is explicit and data-driven (architecture.md). */
  lessonPriority: number;
  word: string;
  /** Present only for nouns that require an article, e.g. "el". */
  article?: string;
  partOfSpeech: string;
  definition?: string;
  /** Accepted English meanings; index 0 is the primary meaning. */
  meanings: string[];
  /** Additional accepted target-language spellings/synonyms besides `word` itself. */
  targetVariants: string[];
  pronunciation: Pronunciation;
  context?: string;
  examples: CurriculumExample[];
  creatorNotes?: string;
  resources: CurriculumResource[];
};

export type GrammarQuestionDirection = "targetToEnglish" | "englishToTarget";

export type GrammarItem = {
  type: "grammar";
  id: string;
  languageId: string;
  levelId: number;
  lessonPriority: number;
  structure: string;
  meaning: string;
  explanation: string;
  usage: string;
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
