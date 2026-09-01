/**
 * Cross-domain answer-checking contract. Pure and framework-free so both the
 * lesson quiz (domains/lessons) and a future review session (domains/srs)
 * can share one implementation, per spec 07 §24: "The same centralized
 * answer-checking behavior should be reusable elsewhere."
 */

export type ArticleRequirement = {
  /** The required article, e.g. "el". */
  article: string;
  /**
   * Accepted answers with the article omitted, used only to distinguish "an
   * otherwise-correct answer missing its required article" from "wrong
   * answer" in feedback. Never treated as a passing answer.
   */
  bareAnswers: string[];
};

export type CheckAnswerInput = {
  userAnswer: string;
  /** Fully correct accepted strings for this question/direction (primary meaning, synonyms, variants). */
  acceptedAnswers: string[];
  /** Present only when this direction requires a target-language article (spec 07 §23). */
  articleRequirement?: ArticleRequirement;
};

export type CheckAnswerResult =
  | { isCorrect: true }
  | { isCorrect: false; reason: "missing_article"; article: string }
  | { isCorrect: false; reason: "no_match" };
