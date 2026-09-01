import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonSessionView } from "@/components/lessons/lesson-session-view";
import type { LessonSessionResult, QuizQuestionView } from "@/domains/lessons";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const openLessonItemAction = vi.fn();
const startQuizAction = vi.fn();
const submitQuizAnswerAction = vi.fn();
const completeLessonAction = vi.fn();

vi.mock("@/app/(focus)/lessons/actions", () => ({
  openLessonItemAction: (...args: unknown[]) => openLessonItemAction(...args),
  startQuizAction: (...args: unknown[]) => startQuizAction(...args),
  submitQuizAnswerAction: (...args: unknown[]) => submitQuizAnswerAction(...args),
  completeLessonAction: (...args: unknown[]) => completeLessonAction(...args),
}));

const INITIAL: LessonSessionResult = {
  token: "initial-token",
  phase: "study",
  sessionId: "session-1",
  batch: [
    { itemId: "vocab-gato", itemType: "vocabulary", label: "gato" },
    { itemId: "vocab-perro", itemType: "vocabulary", label: "perro" },
  ],
  viewedItemIds: [],
  studyItems: [
    {
      itemId: "vocab-gato",
      itemType: "vocabulary",
      item: {
        type: "vocabulary",
        id: "vocab-gato",
        languageId: "es-MX",
        levelId: 1,
        lessonPriority: 1,
        word: "gato",
        article: "el",
        partOfSpeech: "noun",
        meanings: ["cat"],
        targetVariants: [],
        pronunciation: { guide: "GAH-toh" },
        examples: [],
        resources: [],
      },
    },
    {
      itemId: "vocab-perro",
      itemType: "vocabulary",
      item: {
        type: "vocabulary",
        id: "vocab-perro",
        languageId: "es-MX",
        levelId: 1,
        lessonPriority: 2,
        word: "perro",
        article: "el",
        partOfSpeech: "noun",
        meanings: ["dog"],
        targetVariants: [],
        pronunciation: { guide: "PEH-rroh" },
        examples: [],
        resources: [],
      },
    },
  ],
  itemStates: { "vocab-gato": "not-started", "vocab-perro": "not-started" },
};

const QUESTION: QuizQuestionView = {
  questionId: "vocab-gato::targetToEnglish",
  itemId: "vocab-gato",
  itemType: "vocabulary",
  direction: "targetToEnglish",
  prompt: "gato",
  directionLabel: "Spanish → English",
};

beforeEach(() => {
  openLessonItemAction.mockReset();
  startQuizAction.mockReset();
  submitQuizAnswerAction.mockReset();
  completeLessonAction.mockReset();
});

describe("LessonSessionView", () => {
  it("keeps the primary action as Next until every item has been viewed, then offers Start Quiz", async () => {
    openLessonItemAction.mockImplementation(({ itemId }: { itemId: string }) =>
      Promise.resolve({ ok: true, data: { token: "t2", viewedItemIds: ["vocab-gato", "vocab-perro"].filter((id) => id === "vocab-gato" || id === itemId) } }),
    );

    const user = userEvent.setup();
    render(<LessonSessionView initial={INITIAL} />);

    // Marking the first item viewed happens automatically on mount. Wait for
    // the resulting transition to fully settle (button re-enabled) before
    // interacting — asserting only that the mock was *called* leaves a real
    // race: the "Next" button is legitimately `disabled` while that request
    // is still in flight, so clicking too early is a silent no-op.
    const nextButton = screen.getByRole("button", { name: "Next" });
    await waitFor(() => expect(nextButton).toBeEnabled(), { timeout: 3000 });
    expect(screen.queryByRole("button", { name: "Start Quiz" })).not.toBeInTheDocument();

    openLessonItemAction.mockResolvedValueOnce({
      ok: true,
      data: { token: "t3", viewedItemIds: ["vocab-gato", "vocab-perro"] },
    });

    await user.click(nextButton);

    await waitFor(() => expect(screen.getByRole("button", { name: "Start Quiz" })).toBeInTheDocument(), { timeout: 3000 });
  });

  it("exposes an accessible exit control throughout the study phase", () => {
    openLessonItemAction.mockResolvedValue({ ok: true, data: { token: "t2", viewedItemIds: ["vocab-gato"] } });
    render(<LessonSessionView initial={INITIAL} />);
    expect(screen.getByRole("button", { name: "Exit lesson" })).toBeInTheDocument();
  });

  it("transitions into the quiz once Start Quiz is requested", async () => {
    openLessonItemAction.mockResolvedValue({
      ok: true,
      data: { token: "t2", viewedItemIds: ["vocab-gato", "vocab-perro"] },
    });
    startQuizAction.mockResolvedValue({
      ok: true,
      data: {
        token: "quiz-token",
        phase: "quiz",
        sessionId: "session-1",
        batch: INITIAL.batch,
        viewedItemIds: ["vocab-gato", "vocab-perro"],
        currentQuestion: QUESTION,
        itemStates: { "vocab-gato": "current", "vocab-perro": "not-started" },
        quizStats: { requiredCount: 4, satisfiedCount: 0, attempts: 0, correctAttempts: 0 },
      },
    });

    const user = userEvent.setup();
    render(<LessonSessionView initial={INITIAL} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Start Quiz" })).toBeEnabled(), { timeout: 3000 });
    await user.click(screen.getByRole("button", { name: "Start Quiz" }));

    await waitFor(() => expect(screen.getByText("gato")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("Spanish → English")).toBeInTheDocument();
  });

  it("keeps the just-answered item's segment marked current until the learner advances past feedback, instead of jumping to the next item immediately", async () => {
    const QUIZ_INITIAL: LessonSessionResult = {
      ...INITIAL,
      phase: "quiz",
      currentQuestion: QUESTION,
      itemStates: { "vocab-gato": "current", "vocab-perro": "not-started" },
      quizStats: { requiredCount: 4, satisfiedCount: 0, attempts: 0, correctAttempts: 0 },
    };

    submitQuizAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        phase: "quiz",
        sessionId: "session-1",
        batch: INITIAL.batch,
        viewedItemIds: [],
        // Server-computed states already reflect perro as the *next* current
        // item — the component must not apply this until the learner advances.
        currentQuestion: {
          questionId: "vocab-perro::targetToEnglish",
          itemId: "vocab-perro",
          itemType: "vocabulary",
          direction: "targetToEnglish",
          prompt: "perro",
          directionLabel: "Spanish → English",
        },
        itemStates: { "vocab-gato": "complete", "vocab-perro": "current" },
        quizStats: { requiredCount: 4, satisfiedCount: 1, attempts: 1, correctAttempts: 1 },
        feedback: { kind: "correct" },
      },
    });

    const user = userEvent.setup();
    render(<LessonSessionView initial={QUIZ_INITIAL} />);

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "cat{Enter}");
    await waitFor(() => expect(screen.getByText("Correct!")).toBeInTheDocument());

    // Still showing gato's prompt, and gato's segment should still read "current" — not perro's.
    expect(screen.getByText("gato")).toBeInTheDocument();
    expect(screen.getByLabelText("Vocabulary item 1 of 2, current")).toBeInTheDocument();
    expect(screen.queryByLabelText("Vocabulary item 2 of 2, current")).not.toBeInTheDocument();

    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("perro")).toBeInTheDocument());
    expect(screen.getByLabelText("Vocabulary item 2 of 2, current")).toBeInTheDocument();
  });
});
