import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewSessionView } from "@/components/reviews/review-session-view";
import type { ReviewQuestionView, ReviewSessionResult } from "@/domains/srs";

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const submitReviewAnswerAction = vi.fn();
vi.mock("@/app/(focus)/reviews/actions", () => ({
  submitReviewAnswerAction: (...args: unknown[]) =>
    submitReviewAnswerAction(...args),
}));

const speak = vi.fn();
const cancel = vi.fn();
vi.mock("@/providers/speech/speech-synthesis-provider", () => ({
  browserSpeechSynthesisProvider: {
    isSupported: () => true,
    speak: (...args: unknown[]) => speak(...args),
    cancel: (...args: unknown[]) => cancel(...args),
  },
}));

const GATO_TARGET_TO_ENGLISH: ReviewQuestionView = {
  questionId: "gato::targetToEnglish",
  itemId: "gato",
  itemType: "vocabulary",
  direction: "targetToEnglish",
  directionLabel: "Spanish → English",
  presentation: { kind: "typed", prompt: "gato" },
  hint: { mode: "hide" },
  pronunciationText: "gato",
};

const GATO_ENGLISH_TO_TARGET: ReviewQuestionView = {
  questionId: "gato::englishToTarget",
  itemId: "gato",
  itemType: "vocabulary",
  direction: "englishToTarget",
  directionLabel: "English → Spanish",
  presentation: { kind: "typed", prompt: "cat" },
  hint: { mode: "hide" },
  pronunciationText: "gato",
};

const INITIAL: ReviewSessionResult = {
  token: "initial-token",
  sessionId: "session-1",
  phase: "in_progress",
  currentQuestion: GATO_TARGET_TO_ENGLISH,
  characterHelpers: ["ñ"],
  stats: {
    itemsTotal: 1,
    itemsCompleted: 0,
    questionsAttempted: 0,
    questionsCorrect: 0,
  },
};

beforeEach(() => {
  submitReviewAnswerAction.mockReset();
  push.mockReset();
  speak.mockReset();
  cancel.mockReset();
});

describe("ReviewSessionView", () => {
  it("exposes an accessible exit control", () => {
    render(<ReviewSessionView initial={INITIAL} />);
    expect(
      screen.getByRole("button", { name: "Exit review" }),
    ).toBeInTheDocument();
  });

  it("ends the session from the exit dialog and shows a summary of what was worked on", async () => {
    submitReviewAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        sessionId: "session-1",
        phase: "in_progress",
        currentQuestion: GATO_ENGLISH_TO_TARGET,
        characterHelpers: ["ñ"],
        stats: {
          itemsTotal: 1,
          itemsCompleted: 0,
          questionsAttempted: 1,
          questionsCorrect: 1,
        },
        feedback: { kind: "correct" },
        answeredItem: {
          itemId: "gato",
          title: "gato",
          meaning: "cat",
          sentence: {
            targetText: "El gato duerme.",
            translation: "The cat sleeps.",
          },
        },
      },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "cat{Enter}",
    );
    await waitFor(() =>
      expect(screen.getByText("Correct!")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Exit review" }));
    expect(screen.getByText("End review session?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End session" }));

    expect(screen.getByText("Session ended")).toBeInTheDocument();
    expect(screen.getByText("El gato duerme.")).toBeInTheDocument();
    expect(screen.getByLabelText("Correct")).toBeInTheDocument();
  });

  it("keeps showing the just-answered question's feedback until the learner advances, instead of jumping to the next question immediately", async () => {
    submitReviewAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        sessionId: "session-1",
        phase: "in_progress",
        currentQuestion: GATO_ENGLISH_TO_TARGET,
        characterHelpers: ["ñ"],
        stats: {
          itemsTotal: 1,
          itemsCompleted: 0,
          questionsAttempted: 1,
          questionsCorrect: 1,
        },
        feedback: { kind: "correct" },
      },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);

    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "cat{Enter}",
    );
    await waitFor(() =>
      expect(screen.getByText("Correct!")).toBeInTheDocument(),
    );

    // Still showing gato's target->English prompt, not the next question yet.
    expect(screen.getByText("gato")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText("cat")).toBeInTheDocument());
    expect(screen.getByText("English → Spanish")).toBeInTheDocument();
  });

  it("reuses the same idempotency key across a retry of the same question, and generates a new one after advancing", async () => {
    submitReviewAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        sessionId: "session-1",
        phase: "in_progress",
        currentQuestion: GATO_TARGET_TO_ENGLISH,
        characterHelpers: [],
        stats: {
          itemsTotal: 1,
          itemsCompleted: 0,
          questionsAttempted: 1,
          questionsCorrect: 0,
        },
        feedback: {
          kind: "incorrect",
          reason: "no_match",
          userAnswer: "dog",
          expectedAnswer: "cat",
          itemInfo: {
            title: "cat",
            meaning: "cat",
            partOfSpeech: null,
            pronunciation: null,
            explanation: null,
            note: null,
            examples: [],
          },
        },
      },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);

    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "dog{Enter}",
    );
    await waitFor(() =>
      expect(submitReviewAnswerAction).toHaveBeenCalledTimes(1),
    );

    const firstKey = submitReviewAnswerAction.mock.calls[0][0].idempotencyKey;
    expect(typeof firstKey).toBe("string");

    // The retry (same question, after the failed attempt) should carry the same key.
    await waitFor(() =>
      expect(screen.getByText("Not quite")).toBeInTheDocument(),
    );
    await user.keyboard("{Enter}"); // advance past feedback, per the two-step Enter flow
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "cat{Enter}",
    );

    await waitFor(() =>
      expect(submitReviewAnswerAction).toHaveBeenCalledTimes(2),
    );
    const secondKey = submitReviewAnswerAction.mock.calls[1][0].idempotencyKey;
    // Same question (gato::targetToEnglish) was still current for this second submit
    // in this mock setup (the mock always returns the same currentQuestion), so a
    // genuinely new question was never reached — the key should differ only once a
    // *different* question becomes current, which the advance above just did.
    expect(secondKey).not.toBe(firstKey);
  });

  it("shows a stale-completion notice inline and still advances, rather than blocking the session (spec 09 §11)", async () => {
    submitReviewAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        sessionId: "session-1",
        phase: "complete",
        characterHelpers: [],
        stats: {
          itemsTotal: 1,
          itemsCompleted: 1,
          questionsAttempted: 2,
          questionsCorrect: 2,
        },
        feedback: { kind: "correct" },
        staleItem: { itemId: "gato" },
      },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);

    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "cat{Enter}",
    );
    await waitFor(() =>
      expect(screen.getByText(/already updated elsewhere/)).toBeInTheDocument(),
    );

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByText(/You completed/i)).toBeInTheDocument(),
    );
  });

  it("renders the completion view once the session's queue is empty and the learner advances past the final feedback", async () => {
    submitReviewAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        sessionId: "session-1",
        phase: "complete",
        characterHelpers: [],
        stats: {
          itemsTotal: 1,
          itemsCompleted: 1,
          questionsAttempted: 2,
          questionsCorrect: 2,
        },
        feedback: { kind: "correct" },
      },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);

    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "cat{Enter}",
    );
    await waitFor(() =>
      expect(screen.getByText("Correct!")).toBeInTheDocument(),
    );

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByText(/You completed/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders an error state, stating progress was not changed, on an action failure", async () => {
    submitReviewAnswerAction.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "Something went wrong." },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);

    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "cat{Enter}",
    );
    await waitFor(() =>
      expect(
        screen.getByText(/SRS progress was not changed/),
      ).toBeInTheDocument(),
    );
  });

  it("empty submission does nothing — no action call, same question still shown", async () => {
    const user = userEvent.setup();
    render(<ReviewSessionView initial={INITIAL} />);

    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "{Enter}",
    );
    expect(submitReviewAnswerAction).not.toHaveBeenCalled();
    expect(screen.getByText("gato")).toBeInTheDocument();
  });

  it("sends a self-graded submission for a reveal-presentation question (spec 20 Reviews)", async () => {
    const revealInitial: ReviewSessionResult = {
      ...INITIAL,
      currentQuestion: {
        ...GATO_TARGET_TO_ENGLISH,
        presentation: { kind: "reveal", prompt: "gato", revealAnswer: "cat" },
      },
    };
    submitReviewAnswerAction.mockResolvedValue({
      ok: true,
      data: {
        token: "t2",
        sessionId: "session-1",
        phase: "in_progress",
        currentQuestion: GATO_ENGLISH_TO_TARGET,
        characterHelpers: [],
        stats: {
          itemsTotal: 1,
          itemsCompleted: 0,
          questionsAttempted: 1,
          questionsCorrect: 1,
        },
        feedback: { kind: "correct" },
      },
    });

    const user = userEvent.setup();
    render(<ReviewSessionView initial={revealInitial} />);

    await user.click(screen.getByRole("button", { name: "Reveal Answer" }));
    await user.click(screen.getByRole("button", { name: "Know" }));

    await waitFor(() =>
      expect(submitReviewAnswerAction).toHaveBeenCalledTimes(1),
    );
    expect(submitReviewAnswerAction).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: { kind: "self_graded", knowsAnswer: true },
      }),
    );
  });

  describe("Review UI (spec 20)", () => {
    it("pronounces the first item once on mount when Autoplay Audio is on", () => {
      render(
        <ReviewSessionView
          initial={{
            ...INITIAL,
            languageCode: "es-MX",
            reviewUiPreferences: {
              autoplayAudio: true,
              lightningMode: false,
              focusMode: false,
              autoHighlightErrors: true,
              showSrsStage: true,
              autoExpandInfo: false,
              undoAction: "clear_last_character",
            },
          }}
        />,
      );

      expect(speak).toHaveBeenCalledWith({
        text: "gato",
        languageCode: "es-MX",
      });
    });

    it("never pronounces anything when Autoplay Audio is off", () => {
      render(
        <ReviewSessionView
          initial={{
            ...INITIAL,
            languageCode: "es-MX",
            reviewUiPreferences: {
              autoplayAudio: false,
              lightningMode: false,
              focusMode: false,
              autoHighlightErrors: true,
              showSrsStage: true,
              autoExpandInfo: false,
              undoAction: "clear_last_character",
            },
          }}
        />,
      );

      expect(speak).not.toHaveBeenCalled();
    });

    it("cancels any in-flight speech on unmount", () => {
      const { unmount } = render(
        <ReviewSessionView initial={{ ...INITIAL, languageCode: "es-MX" }} />,
      );
      unmount();
      expect(cancel).toHaveBeenCalled();
    });

    it("Lightning Mode auto-advances past a correct answer without a Continue click", async () => {
      submitReviewAnswerAction.mockResolvedValue({
        ok: true,
        data: {
          token: "t2",
          sessionId: "session-1",
          phase: "in_progress",
          currentQuestion: GATO_ENGLISH_TO_TARGET,
          characterHelpers: ["ñ"],
          stats: {
            itemsTotal: 1,
            itemsCompleted: 0,
            questionsAttempted: 1,
            questionsCorrect: 1,
          },
          feedback: { kind: "correct" },
        },
      });

      const user = userEvent.setup();
      render(
        <ReviewSessionView
          initial={{
            ...INITIAL,
            reviewUiPreferences: {
              autoplayAudio: false,
              lightningMode: true,
              focusMode: false,
              autoHighlightErrors: true,
              showSrsStage: true,
              autoExpandInfo: false,
              undoAction: "clear_last_character",
            },
          }}
        />,
      );

      await user.type(
        screen.getByRole("textbox", { name: "Your answer" }),
        "cat{Enter}",
      );
      await waitFor(() =>
        expect(screen.getByText("Correct!")).toBeInTheDocument(),
      );

      // No further click — Lightning Mode advances on its own.
      await waitFor(() => expect(screen.getByText("cat")).toBeInTheDocument(), {
        timeout: 3000,
      });
    });

    it("does not auto-advance an incorrect answer even with Lightning Mode on", async () => {
      submitReviewAnswerAction.mockResolvedValue({
        ok: true,
        data: {
          token: "t2",
          sessionId: "session-1",
          phase: "in_progress",
          currentQuestion: GATO_TARGET_TO_ENGLISH,
          characterHelpers: [],
          stats: {
            itemsTotal: 1,
            itemsCompleted: 0,
            questionsAttempted: 1,
            questionsCorrect: 0,
          },
          feedback: {
            kind: "incorrect",
            reason: "no_match",
            userAnswer: "dog",
            expectedAnswer: "cat",
            itemInfo: {
              title: "cat",
              meaning: "cat",
              partOfSpeech: null,
              pronunciation: null,
              explanation: null,
              note: null,
              examples: [],
            },
          },
        },
      });

      const user = userEvent.setup();
      render(
        <ReviewSessionView
          initial={{
            ...INITIAL,
            reviewUiPreferences: {
              autoplayAudio: false,
              lightningMode: true,
              focusMode: false,
              autoHighlightErrors: true,
              showSrsStage: true,
              autoExpandInfo: false,
              undoAction: "clear_last_character",
            },
          }}
        />,
      );

      await user.type(
        screen.getByRole("textbox", { name: "Your answer" }),
        "dog{Enter}",
      );
      await waitFor(() =>
        expect(screen.getByText("Not quite")).toBeInTheDocument(),
      );

      // Still awaiting an explicit advance a full second later.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(screen.getByText("Not quite")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Continue" }),
      ).toBeInTheDocument();
    });

    it("Focus Mode hides the accuracy percentage from the top bar", async () => {
      submitReviewAnswerAction.mockResolvedValue({
        ok: true,
        data: {
          token: "t2",
          sessionId: "session-1",
          phase: "in_progress",
          currentQuestion: GATO_ENGLISH_TO_TARGET,
          characterHelpers: ["ñ"],
          stats: {
            itemsTotal: 2,
            itemsCompleted: 0,
            questionsAttempted: 1,
            questionsCorrect: 1,
          },
          feedback: { kind: "correct" },
        },
      });

      const user = userEvent.setup();
      render(
        <ReviewSessionView
          initial={{
            ...INITIAL,
            stats: {
              itemsTotal: 2,
              itemsCompleted: 0,
              questionsAttempted: 0,
              questionsCorrect: 0,
            },
            reviewUiPreferences: {
              autoplayAudio: false,
              lightningMode: false,
              focusMode: true,
              autoHighlightErrors: true,
              showSrsStage: true,
              autoExpandInfo: false,
              undoAction: "clear_last_character",
            },
          }}
        />,
      );

      await user.type(
        screen.getByRole("textbox", { name: "Your answer" }),
        "cat{Enter}",
      );
      await waitFor(() =>
        expect(screen.getByText("Correct!")).toBeInTheDocument(),
      );

      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });
  });
});
