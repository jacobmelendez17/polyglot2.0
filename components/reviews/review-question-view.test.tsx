import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewQuestionView } from "@/components/reviews/review-question-view";
import type { ReviewQuestionView as ReviewQuestionViewData } from "@/domains/srs";

const QUESTION: ReviewQuestionViewData = {
  questionId: "gato::targetToEnglish",
  itemId: "gato",
  itemType: "vocabulary",
  direction: "targetToEnglish",
  directionLabel: "Spanish → English",
  presentation: { kind: "typed", prompt: "gato" },
};

const REVEAL_QUESTION: ReviewQuestionViewData = {
  ...QUESTION,
  presentation: { kind: "reveal", prompt: "gato", revealAnswer: "cat" },
};

const CLOZE_TYPED_QUESTION: ReviewQuestionViewData = {
  ...QUESTION,
  direction: "englishToTarget",
  directionLabel: "English → Spanish",
  presentation: { kind: "cloze_typed", sentenceBefore: "Yo tengo un ", sentenceAfter: " negro." },
};

const CLOZE_REVEAL_QUESTION: ReviewQuestionViewData = {
  ...CLOZE_TYPED_QUESTION,
  presentation: { kind: "cloze_reveal", sentenceBefore: "Yo tengo un ", sentenceAfter: " negro.", revealAnswer: "gato" },
};

function renderQuestion(overrides: Partial<Parameters<typeof ReviewQuestionView>[0]> = {}) {
  return render(
    <ReviewQuestionView
      question={QUESTION}
      feedback={null}
      awaitingAdvance={false}
      characterHelpers={[]}
      isPending={false}
      onSubmit={() => {}}
      onKnowsAnswer={() => {}}
      onAdvance={() => {}}
      {...overrides}
    />,
  );
}

describe("ReviewQuestionView", () => {
  it("renders no card, panel, or bordered container around the prompt or feedback (spec 09 §16)", () => {
    const { container } = renderQuestion();

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  it("shows the prompt and direction label", () => {
    renderQuestion();

    expect(screen.getByText("gato")).toBeInTheDocument();
    expect(screen.getByText("Spanish → English")).toBeInTheDocument();
  });

  it("submits the answer on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderQuestion({ onSubmit });

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "cat{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("cat");
  });

  it("also submits on a Submit button click, for mouse/touch users", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderQuestion({ onSubmit });

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "cat");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith("cat");
  });

  it("does nothing on Enter with an empty answer", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderQuestion({ onSubmit });

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("advances on Enter once feedback is displayed", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    renderQuestion({ feedback: { kind: "correct" }, awaitingAdvance: true, onAdvance });

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "{Enter}");
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("shows correct feedback", () => {
    renderQuestion({ feedback: { kind: "correct" }, awaitingAdvance: true });

    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });

  it("shows incorrect feedback with what the learner entered and the expected answer", () => {
    renderQuestion({
      feedback: { kind: "incorrect", reason: "no_match", userAnswer: "dog", expectedAnswer: "cat" },
      awaitingAdvance: true,
    });

    expect(screen.getByText("dog")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("explains a missing-article mistake specifically", () => {
    renderQuestion({
      feedback: { kind: "incorrect", reason: "missing_article", article: "el", userAnswer: "gato", expectedAnswer: "el gato" },
      awaitingAdvance: true,
    });

    expect(screen.getByText(/requires the article/i)).toBeInTheDocument();
  });

  it("inserts an accent character at the caret without losing existing input", async () => {
    const user = userEvent.setup();
    renderQuestion({ characterHelpers: ["ñ"] });

    const input = screen.getByRole("textbox", { name: "Your answer" }) as HTMLInputElement;
    await user.type(input, "ni");
    await user.click(screen.getByRole("button", { name: "ñ" }));
    expect(input.value).toBe("niñ");
  });

  it("never disables the answer input, even while a request is pending — disabling forces a browser blur that breaks the Enter-to-advance flow", () => {
    renderQuestion({ isPending: true });

    const input = screen.getByRole("textbox", { name: "Your answer" });
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
  });

  it("keeps the answer input readOnly (not disabled) while awaiting advance", () => {
    renderQuestion({ feedback: { kind: "correct" }, awaitingAdvance: true });

    const input = screen.getByRole("textbox", { name: "Your answer" });
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
  });

  describe("Flashcard / Cloze (Flashcard) — reveal presentation (spec 20 Reviews)", () => {
    it("shows Reveal Answer instead of a text field, then Know/Don't Know after revealing", async () => {
      const user = userEvent.setup();
      renderQuestion({ question: REVEAL_QUESTION });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("gato")).toBeInTheDocument();
      expect(screen.queryByText("cat")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Reveal Answer" }));

      expect(screen.getByText("cat")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Know" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Don't Know" })).toBeInTheDocument();
    });

    it("reports Know/Don't Know via onKnowsAnswer", async () => {
      const user = userEvent.setup();
      const onKnowsAnswer = vi.fn();
      renderQuestion({ question: REVEAL_QUESTION, onKnowsAnswer });

      await user.click(screen.getByRole("button", { name: "Reveal Answer" }));
      await user.click(screen.getByRole("button", { name: "Know" }));

      expect(onKnowsAnswer).toHaveBeenCalledWith(true);
    });

    it("shows the answer and a Continue button while awaiting advance, without re-asking Know/Don't Know", () => {
      renderQuestion({ question: REVEAL_QUESTION, feedback: { kind: "correct" }, awaitingAdvance: true });

      expect(screen.getByText("cat")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Know" })).not.toBeInTheDocument();
    });

    it("shows self-graded incorrect feedback with no expected-answer breakdown (the learner already saw it via Reveal)", () => {
      renderQuestion({ question: REVEAL_QUESTION, feedback: { kind: "self_graded_incorrect" }, awaitingAdvance: true });

      expect(screen.getByText("Not quite")).toBeInTheDocument();
      expect(screen.queryByText("You entered")).not.toBeInTheDocument();
    });
  });

  describe("Cloze (Manual) — cloze_typed presentation", () => {
    it("renders the sentence with a blank instead of the bare prompt, and a typed answer field", () => {
      renderQuestion({ question: CLOZE_TYPED_QUESTION });

      expect(screen.getByText(/Yo tengo un/)).toBeInTheDocument();
      expect(screen.getByText(/negro\./)).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();
      expect(screen.queryByText("Spanish → English")).not.toBeInTheDocument();
    });

    it("submits the typed cloze answer the same way as an ordinary typed question", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderQuestion({ question: CLOZE_TYPED_QUESTION, onSubmit });

      await user.type(screen.getByRole("textbox", { name: "Your answer" }), "gato{Enter}");
      expect(onSubmit).toHaveBeenCalledWith("gato");
    });
  });

  describe("Cloze (Flashcard) — cloze_reveal presentation", () => {
    it("renders the sentence with a blank and a Reveal button (not Reveal Answer)", () => {
      renderQuestion({ question: CLOZE_REVEAL_QUESTION });

      expect(screen.getByText(/Yo tengo un/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reveal" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reveal Answer" })).not.toBeInTheDocument();
    });

    it("reveals the blanked word and offers Know/Don't Know", async () => {
      const user = userEvent.setup();
      renderQuestion({ question: CLOZE_REVEAL_QUESTION });

      await user.click(screen.getByRole("button", { name: "Reveal" }));

      expect(screen.getByText("gato")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Know" })).toBeInTheDocument();
    });
  });
});
