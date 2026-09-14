/**
 * The learner's Review Type preference, as pure values and rules (spec 20
 * Reviews). Database-free on purpose, matching `domains/users/curriculum-
 * preference.ts`'s split between "what the values are" (here) and "how a
 * question is built/graded from one" (`review-presentation.ts`,
 * `review-queue.ts`).
 */

export const REVIEW_TYPES = ["cloze_manual", "cloze_flashcard", "flashcard"] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

/** The spec's own default — shown pre-selected in its mockup, listed first among the three options. */
export const DEFAULT_REVIEW_TYPE: ReviewType = "cloze_manual";

export function isReviewType(value: unknown): value is ReviewType {
  return typeof value === "string" && (REVIEW_TYPES as readonly string[]).includes(value);
}

/** Whether `reviewType` ever attempts a sentence-blank presentation at all (as opposed to Flashcard, which never does). */
export function isClozeReviewType(reviewType: ReviewType): boolean {
  return reviewType === "cloze_manual" || reviewType === "cloze_flashcard";
}

/**
 * This learner's review-type choices for one language. Unlike
 * `LanguageSettings`, there is no "never chosen" state to represent — both
 * fields always have a real value, defaulted at the effective-read layer
 * (`review-preference-repository.ts`'s `findReviewPreferences`) exactly like
 * `ContentPreferences`.
 */
export type ReviewPreferences = {
  userId: string;
  languageId: string;
  grammarReviewType: ReviewType;
  vocabularyReviewType: ReviewType;
};

export const DEFAULT_REVIEW_PREFERENCES: Pick<ReviewPreferences, "grammarReviewType" | "vocabularyReviewType"> = {
  grammarReviewType: DEFAULT_REVIEW_TYPE,
  vocabularyReviewType: DEFAULT_REVIEW_TYPE,
};
