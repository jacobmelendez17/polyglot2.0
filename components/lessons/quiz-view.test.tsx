import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { QuizView } from "@/components/lessons/quiz-view";
import type { QuizQuestionView, QuizStats } from "@/domains/lessons";

const QUESTION: QuizQuestionView = {
  questionId: "vocab-gato::targetToEnglish",
  itemId: "vocab-gato",
  itemType: "vocabulary",
  direction: "targetToEnglish",
  prompt: "gato",
  directionLabel: "Spanish → English",
};

const STATS: QuizStats = { requiredCount: 12, satisfiedCount: 4, attempts: 5, correctAttempts: 4 };

describe("QuizView", () => {
  it("renders no card, panel, or bordered container around the prompt, input, or feedback", () => {
    const { container } = render(
      <QuizView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
        onExit={() => {}}
      />,
    );

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  it("renders the top-right session context with answered count and accuracy", () => {
    render(
      <QuizView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
        onExit={() => {}}
      />,
    );

    expect(screen.getByText(/4 \/ 12/)).toBeInTheDocument();
    expect(screen.getByText(/80%/)).toBeInTheDocument();
  });

  it("submits the answer on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <QuizView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={onSubmit}
        onAdvance={() => {}}
        onExit={() => {}}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "cat{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("cat");
  });

  it("does nothing on Enter with an empty answer", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <QuizView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={onSubmit}
        onAdvance={() => {}}
        onExit={() => {}}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("advances on Enter once feedback is displayed", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <QuizView
        question={QUESTION}
        feedback={{ kind: "correct" }}
        awaitingAdvance
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={onAdvance}
        onExit={() => {}}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "{Enter}");
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("renders incorrect feedback with what the learner entered and the expected answer", () => {
    render(
      <QuizView
        question={QUESTION}
        feedback={{ kind: "incorrect", reason: "no_match", userAnswer: "dog", expectedAnswer: "cat" }}
        awaitingAdvance
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
        onExit={() => {}}
      />,
    );

    expect(screen.getByText("dog")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByText(/no progress was affected/i)).toBeInTheDocument();
  });

  it("explains a missing-article mistake specifically", () => {
    render(
      <QuizView
        question={QUESTION}
        feedback={{ kind: "incorrect", reason: "missing_article", article: "el", userAnswer: "gato", expectedAnswer: "el gato" }}
        awaitingAdvance
        quizStats={STATS}
        segments={[]}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
        onExit={() => {}}
      />,
    );

    expect(screen.getByText(/requires the article/i)).toBeInTheDocument();
  });
});
