import type { CefrLevel, DictionaryOverridableField, GrammarContentBlockType, Register } from "@/db/schema";


/**
 * Real, database-backed curriculum domain types (spec 08 §30, §31) —
 * independent of `curriculum-types.ts`'s fixture types (spec 07's
 * placeholder, still consumed by `domains/lessons` and left untouched per
 * the additive-not-swap decision recorded in progress-tracker.md). Named
 * distinctly (`Curriculum*`) so nothing here collides with the fixture
 * exports in `index.ts`.
 */

export type CurriculumStatus = "draft" | "pending" | "published" | "archived";

export interface CurriculumLanguage {
  id: string;
  code: string;
  slug: string;
  name: string;
}

export interface CurriculumLevel {
  id: string;
  languageId: string;
  levelNumber: number;
  name: string | null;
  status: CurriculumStatus;
  /** The CEFR band shown in an item page's hero (spec 18). `null` until an admin sets one. */
  cefrLevel: CefrLevel | null;
}

export interface CurriculumVocabularyGroup {
  id: string;
  levelId: string;
  languageId: string;
  name: string;
  position: number;
  status: CurriculumStatus;
}

/** Field names match `domains/lexicon`'s `VocabularyDetailCurriculum.examples` exactly, so a single example-list component can render either. */
export interface CurriculumExampleSentence {
  targetText: string;
  translation: string;
}

export interface CurriculumVocabularyDetail {
  vocabularyGroupId: string;
  term: string;
  primaryMeaning: string;
  definition: string | null;
  article: string | null;
  partOfSpeech: string;
  pronunciation: string | null;
  ipa: string | null;
  context: string | null;
  creatorNotes: string | null;
  /** How formal/marked the word is (spec 18). `null` means unclassified, never "neutral". */
  register: Register | null;
  /** Fields an author has taken over from the dictionary (spec 17) — the editor shows provenance from this. */
  dictionaryFieldOverrides: DictionaryOverridableField[];
}

export type CurriculumGrammarQuestionDirection = "targetToEnglish" | "englishToTarget";
export type CurriculumGrammarQuestionFormat = "translation";
export type CurriculumGrammarQuestionRequirement = {
  format: CurriculumGrammarQuestionFormat;
  direction: CurriculumGrammarQuestionDirection;
};

export interface CurriculumGrammarDetail {
  title: string | null;
  structure: string;
  primaryMeaning: string;
  explanation: string;
  category: string | null;
  creatorNotes: string | null;
  /** How formal/marked the structure is (spec 18). `null` means unclassified. */
  register: Register | null;
  /** The configured review question requirements for this concept (spec 09 §7) — never assume bidirectional translation. */
  requiredQuestions: CurriculumGrammarQuestionRequirement[];
}

interface CurriculumLearningItemBase {
  id: string;
  languageId: string;
  levelId: string;
  status: CurriculumStatus;
  position: number;
  lessonPriority: number;
  /** Optimistic-concurrency version (spec 11 rewrite's `ADMIN_EDIT_CONFLICT`) — bumped on every publish. */
  version: number;
}

export type CurriculumLearningItem =
  | (CurriculumLearningItemBase & { type: "vocabulary"; vocabulary: CurriculumVocabularyDetail })
  | (CurriculumLearningItemBase & { type: "grammar"; grammar: CurriculumGrammarDetail });

/**
 * One ordered block of a grammar item's About content (spec 18). The union
 * mirrors `grammar_content_blocks`' check constraint exactly, so an
 * impossible shape — an example with no translation, a note with no body —
 * is unrepresentable in the type as well as in the database.
 */
export type CurriculumGrammarContentBlock =
  | { id: string; position: number; type: Extract<GrammarContentBlockType, "text" | "note">; body: string }
  | { id: string; position: number; type: Extract<GrammarContentBlockType, "example">; targetText: string; translation: string };

/** One admin-authored external resource link (spec 18). Official content only — never learner-private material. */
export interface CurriculumItemResource {
  id: string;
  label: string;
  url: string;
  position: number;
}
