import { describe, expect, it } from "vitest";

import {
  isTypedPresentation,
  resolveReviewPresentation,
} from "./review-presentation";
import type { ReviewQuestionAnswerSpec } from "./review-answer-spec";

const ANSWER_SPEC: ReviewQuestionAnswerSpec = {
  acceptedAnswers: ["el gato"],
  expectedAnswerDisplay: "el gato",
  prompt: "cat",
  articleRequirement: { article: "el", bareAnswers: ["gato"] },
};

const CLOZE_SENTENCE = {
  sentenceId: "s1",
  sentenceBefore: "El ",
  sentenceAfter: " duerme.",
  blankedWord: "gato",
};

describe("resolveReviewPresentation", () => {
  it("builds a cloze_typed presentation for Cloze (Manual) on englishToTarget with a compatible sentence", () => {
    const result = resolveReviewPresentation({
      reviewType: "cloze_manual",
      direction: "englishToTarget",
      answerSpec: ANSWER_SPEC,
      clozeSentence: CLOZE_SENTENCE,
    });
    expect(result).toEqual({
      kind: "cloze_typed",
      sentenceBefore: "El ",
      sentenceAfter: " duerme.",
    });
  });

  it("builds a cloze_reveal presentation for Cloze (Flashcard) on englishToTarget with a compatible sentence", () => {
    const result = resolveReviewPresentation({
      reviewType: "cloze_flashcard",
      direction: "englishToTarget",
      answerSpec: ANSWER_SPEC,
      clozeSentence: CLOZE_SENTENCE,
    });
    expect(result).toEqual({
      kind: "cloze_reveal",
      sentenceBefore: "El ",
      sentenceAfter: " duerme.",
      revealAnswer: "gato",
    });
  });

  it("falls back to the ordinary typed prompt for Cloze (Manual) with no compatible sentence", () => {
    const result = resolveReviewPresentation({
      reviewType: "cloze_manual",
      direction: "englishToTarget",
      answerSpec: ANSWER_SPEC,
      clozeSentence: null,
    });
    expect(result).toEqual({ kind: "typed", prompt: "cat" });
  });

  it("falls back to reveal for Cloze (Flashcard) with no compatible sentence", () => {
    const result = resolveReviewPresentation({
      reviewType: "cloze_flashcard",
      direction: "englishToTarget",
      answerSpec: ANSWER_SPEC,
      clozeSentence: null,
    });
    expect(result).toEqual({
      kind: "reveal",
      prompt: "cat",
      revealAnswer: "el gato",
    });
  });

  it("never applies Cloze to the targetToEnglish direction, even with a compatible sentence", () => {
    const manual = resolveReviewPresentation({
      reviewType: "cloze_manual",
      direction: "targetToEnglish",
      answerSpec: ANSWER_SPEC,
      clozeSentence: CLOZE_SENTENCE,
    });
    expect(manual).toEqual({ kind: "typed", prompt: "cat" });

    const flashcard = resolveReviewPresentation({
      reviewType: "cloze_flashcard",
      direction: "targetToEnglish",
      answerSpec: ANSWER_SPEC,
      clozeSentence: CLOZE_SENTENCE,
    });
    expect(flashcard).toEqual({
      kind: "reveal",
      prompt: "cat",
      revealAnswer: "el gato",
    });
  });

  it("is always reveal for Flashcard, on either direction, regardless of a compatible sentence", () => {
    const withSentence = resolveReviewPresentation({
      reviewType: "flashcard",
      direction: "englishToTarget",
      answerSpec: ANSWER_SPEC,
      clozeSentence: CLOZE_SENTENCE,
    });
    expect(withSentence).toEqual({
      kind: "reveal",
      prompt: "cat",
      revealAnswer: "el gato",
    });

    const withoutSentence = resolveReviewPresentation({
      reviewType: "flashcard",
      direction: "targetToEnglish",
      answerSpec: ANSWER_SPEC,
      clozeSentence: null,
    });
    expect(withoutSentence).toEqual({
      kind: "reveal",
      prompt: "cat",
      revealAnswer: "el gato",
    });
  });
});

describe("isTypedPresentation", () => {
  it("is true for typed and cloze_typed", () => {
    expect(isTypedPresentation({ kind: "typed", prompt: "cat" })).toBe(true);
    expect(
      isTypedPresentation({
        kind: "cloze_typed",
        sentenceBefore: "",
        sentenceAfter: "",
      }),
    ).toBe(true);
  });

  it("is false for reveal and cloze_reveal", () => {
    expect(
      isTypedPresentation({
        kind: "reveal",
        prompt: "cat",
        revealAnswer: "gato",
      }),
    ).toBe(false);
    expect(
      isTypedPresentation({
        kind: "cloze_reveal",
        sentenceBefore: "",
        sentenceAfter: "",
        revealAnswer: "gato",
      }),
    ).toBe(false);
  });
});
