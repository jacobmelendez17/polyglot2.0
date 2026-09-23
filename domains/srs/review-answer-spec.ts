import type {
  AcceptedAnswerInput,
  CurriculumLearningItem,
} from "@/domains/curriculum";
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
 * answer, article requirement where applicable, official curriculum-authored
 * synonyms/variants (`officialAnswers`, spec 11 rewrite's `accepted_answers`
 * table — an admin's own additions from the item editor), and applicable
 * user-created synonyms (`domains/learner-content`'s `user_synonyms` —
 * `side: "meaning"` accepted alongside the target→English official answer,
 * `side: "term"` alongside the English→target one). Only ever called
 * server-side (spec 09 §7's "the server decides correctness") — the
 * accepted answers this returns must never reach the client ahead of
 * grading.
 *
 * Grammar only ever widens on the target→English direction — an
 * `accepted_answers` row is never authored with `side: "term"` for a
 * grammar item today (the item page has no Variations card for grammar to
 * begin with; see `ItemDetailSource`'s grammar variant), so there is
 * nothing to merge on the English→target side.
 *
 * **Fixed 2026-09-23** (was a real, user-reported gap, not a deliberate
 * design choice): this used to accept only the single official
 * `primaryMeaning`/`term` plus a learner's own private synonyms —
 * admin-authored official synonyms/variants were silently ignored here even
 * though `domains/lessons` already merged them in
 * (`lesson-curriculum-repository.ts`'s `meanings`/`targetVariants`). An
 * admin adding "hi" as an accepted synonym for "hola" would grade correctly
 * in a Lesson quiz and incorrectly in a Review of the same item. The stale
 * comment that used to be here ("the real curriculum schema has no column
 * for official answer variations... it will pick up official variations
 * for free... whenever that capability is added") was simply never revisited
 * once that capability — `AcceptedAnswersEditor`, spec 11 rewrite — actually
 * shipped.
 */
export function getReviewQuestionAnswerSpec(
  item: CurriculumLearningItem,
  direction: ReviewQuestionDirection,
  synonyms: LearnerSynonym[],
  officialAnswers: AcceptedAnswerInput[],
): ReviewQuestionAnswerSpec {
  if (item.type === "vocabulary") {
    const { term, primaryMeaning, article } = item.vocabulary;

    if (direction === "targetToEnglish") {
      const officialSynonyms = officialAnswers
        .filter((answer) => answer.side === "meaning")
        .map((answer) => answer.value);
      const userSynonyms = synonyms
        .filter((synonym) => synonym.side === "meaning")
        .map((synonym) => synonym.value);
      return {
        acceptedAnswers: [primaryMeaning, ...officialSynonyms, ...userSynonyms],
        expectedAnswerDisplay: primaryMeaning,
        prompt: term,
      };
    }

    const officialVariants = officialAnswers
      .filter((answer) => answer.side === "term")
      .map((answer) => answer.value);
    const userSynonyms = synonyms
      .filter((synonym) => synonym.side === "term")
      .map((synonym) => synonym.value);
    const bareForms = [term, ...officialVariants, ...userSynonyms];
    const acceptedAnswers = article
      ? bareForms.map((form) => `${article} ${form}`)
      : bareForms;

    return {
      acceptedAnswers,
      articleRequirement: article
        ? { article, bareAnswers: bareForms }
        : undefined,
      expectedAnswerDisplay: acceptedAnswers[0],
      prompt: primaryMeaning,
    };
  }

  const { structure, primaryMeaning } = item.grammar;

  if (direction === "targetToEnglish") {
    const officialSynonyms = officialAnswers
      .filter((answer) => answer.side === "meaning")
      .map((answer) => answer.value);
    return {
      acceptedAnswers: [primaryMeaning, ...officialSynonyms],
      expectedAnswerDisplay: primaryMeaning,
      prompt: structure,
    };
  }

  return {
    acceptedAnswers: [structure],
    expectedAnswerDisplay: structure,
    prompt: primaryMeaning,
  };
}
