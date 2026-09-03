import type { CurriculumLearningItem } from "@/domains/curriculum";
import type { LearnerSynonym } from "@/domains/learner-content";
import type { ArticleRequirement } from "@/lib/answer-checking";

import type { ReviewQuestionDirection } from "./review-types";

export type ReviewQuestionAnswerSpec = {
  acceptedAnswers: string[];
  articleRequirement?: ArticleRequirement;
  expectedAnswerDisplay: string;
  prompt: string;
};

/**
 * Resolves the prompt and authoritative accepted-answer data for one review
 * question, from real curriculum content (spec 09 §7): official accepted
 * answer, article requirement where applicable, and applicable
 * user-created synonyms (`domains/learner-content`'s `user_synonyms` —
 * `side: "meaning"` accepted alongside the target→English official answer,
 * `side: "term"` alongside the English→target one). Only ever called
 * server-side (spec 09 §7's "the server decides correctness") — the
 * accepted answers this returns must never reach the client ahead of
 * grading.
 *
 * **Known gap** (recorded in progress-tracker.md): the real curriculum
 * schema has no column for official *curriculum-authored* answer variations
 * beyond the single `primaryMeaning`/`term` — spec 07's fixture curriculum
 * had `meanings: string[]`/`targetVariants: string[]`, but spec 08's real
 * `vocabulary_items` table doesn't. `acceptedAnswers` here is therefore the
 * one official value plus any real user synonyms, which is accurate to the
 * real data that exists today; it will pick up official variations for
 * free, with no change to this function, whenever that curriculum-authoring
 * capability is added.
 */
export function getReviewQuestionAnswerSpec(
  item: CurriculumLearningItem,
  direction: ReviewQuestionDirection,
  synonyms: LearnerSynonym[],
): ReviewQuestionAnswerSpec {
  if (item.type === "vocabulary") {
    const { term, primaryMeaning, article } = item.vocabulary;

    if (direction === "targetToEnglish") {
      const userSynonyms = synonyms.filter((synonym) => synonym.side === "meaning").map((synonym) => synonym.value);
      return {
        acceptedAnswers: [primaryMeaning, ...userSynonyms],
        expectedAnswerDisplay: primaryMeaning,
        prompt: term,
      };
    }

    const userSynonyms = synonyms.filter((synonym) => synonym.side === "term").map((synonym) => synonym.value);
    const bareForms = [term, ...userSynonyms];
    const acceptedAnswers = article ? bareForms.map((form) => `${article} ${form}`) : bareForms;

    return {
      acceptedAnswers,
      articleRequirement: article ? { article, bareAnswers: bareForms } : undefined,
      expectedAnswerDisplay: acceptedAnswers[0],
      prompt: primaryMeaning,
    };
  }

  const { structure, primaryMeaning } = item.grammar;

  if (direction === "targetToEnglish") {
    return { acceptedAnswers: [primaryMeaning], expectedAnswerDisplay: primaryMeaning, prompt: structure };
  }

  return { acceptedAnswers: [structure], expectedAnswerDisplay: structure, prompt: primaryMeaning };
}
