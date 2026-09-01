import type { LearningItem } from "@/domains/curriculum";
import type { ArticleRequirement } from "@/lib/answer-checking";

import type { QuizQuestion, QuizQuestionDirection } from "./lesson-types";

function questionId(itemId: string, direction: QuizQuestionDirection): string {
  return `${itemId}::${direction}`;
}

/**
 * Builds every required comprehension question for a lesson batch. Vocabulary
 * is bidirectional (spec 07 §23); grammar uses whichever question format(s)
 * the curriculum concept is configured for (spec 07 §25) — never an invented
 * format. This is the lesson domain's only source of quiz requirements;
 * components must never hardcode them (spec 07 §22).
 */
export function buildQuizQuestions(items: LearningItem[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];

  for (const item of items) {
    if (item.type === "vocabulary") {
      questions.push({
        id: questionId(item.id, "targetToEnglish"),
        itemId: item.id,
        itemType: "vocabulary",
        direction: "targetToEnglish",
      });
      questions.push({
        id: questionId(item.id, "englishToTarget"),
        itemId: item.id,
        itemType: "vocabulary",
        direction: "englishToTarget",
      });
    } else {
      for (const required of item.requiredQuestions) {
        questions.push({
          id: questionId(item.id, required.direction),
          itemId: item.id,
          itemType: "grammar",
          direction: required.direction,
        });
      }
    }
  }

  return questions;
}

export type QuestionAnswerSpec = {
  acceptedAnswers: string[];
  articleRequirement?: ArticleRequirement;
  expectedAnswerDisplay: string;
  prompt: string;
};

/**
 * Resolves the prompt and authoritative accepted-answer data for one
 * question. Only ever called server-side (spec 07 §29) — the accepted
 * answers this returns must never be sent to the client ahead of grading.
 */
export function getQuestionAnswerSpec(item: LearningItem, direction: QuizQuestionDirection): QuestionAnswerSpec {
  if (item.type === "vocabulary") {
    if (direction === "targetToEnglish") {
      return {
        acceptedAnswers: item.meanings,
        expectedAnswerDisplay: item.meanings[0],
        prompt: item.word,
      };
    }

    const targetForms = [item.word, ...item.targetVariants];
    const acceptedAnswers = item.article ? targetForms.map((form) => `${item.article} ${form}`) : targetForms;

    return {
      acceptedAnswers,
      articleRequirement: item.article ? { article: item.article, bareAnswers: targetForms } : undefined,
      expectedAnswerDisplay: acceptedAnswers[0],
      prompt: item.meanings[0],
    };
  }

  if (direction === "targetToEnglish") {
    return { acceptedAnswers: [item.meaning], expectedAnswerDisplay: item.meaning, prompt: item.structure };
  }

  return { acceptedAnswers: [item.structure], expectedAnswerDisplay: item.structure, prompt: item.meaning };
}
