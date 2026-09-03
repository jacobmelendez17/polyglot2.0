/**
 * Real, database-backed curriculum domain types (spec 08 §30, §31) —
 * independent of `curriculum-types.ts`'s fixture types (spec 07's
 * placeholder, still consumed by `domains/lessons` and left untouched per
 * the additive-not-swap decision recorded in progress-tracker.md). Named
 * distinctly (`Curriculum*`) so nothing here collides with the fixture
 * exports in `index.ts`.
 */

export type CurriculumStatus = "draft" | "published" | "archived";

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
}

export interface CurriculumVocabularyGroup {
  id: string;
  levelId: string;
  languageId: string;
  name: string;
  position: number;
  status: CurriculumStatus;
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
}

export type CurriculumLearningItem =
  | (CurriculumLearningItemBase & { type: "vocabulary"; vocabulary: CurriculumVocabularyDetail })
  | (CurriculumLearningItemBase & { type: "grammar"; grammar: CurriculumGrammarDetail });
