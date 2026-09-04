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
  prompt: "gato",
  directionLabel: "Spanish → English",
};

describe("ReviewQuestionView", () => {
  it("renders no card, panel, or bordered container around the prompt or feedback (spec 09 §16)", () => {
    const { container } = render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(container.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  it("shows the prompt and direction label", () => {
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    expect(screen.getByText("gato")).toBeInTheDocument();
    expect(screen.getByText("Spanish → English")).toBeInTheDocument();
  });

  it("submits the answer on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={[]}
        isPending={false}
        onSubmit={onSubmit}
        onAdvance={() => {}}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "cat{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("cat");
  });

  it("also submits on a Submit button click, for mouse/touch users", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={[]}
        isPending={false}
        onSubmit={onSubmit}
        onAdvance={() => {}}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "cat");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith("cat");
  });

  it("does nothing on Enter with an empty answer", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={[]}
        isPending={false}
        onSubmit={onSubmit}
        onAdvance={() => {}}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("advances on Enter once feedback is displayed", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={{ kind: "correct" }}
        awaitingAdvance
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={onAdvance}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "{Enter}");
    expect(onAdvance).toHaveBeenCalledOnce();
  });

  it("shows correct feedback", () => {
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={{ kind: "correct" }}
        awaitingAdvance
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });

  it("shows incorrect feedback with what the learner entered and the expected answer", () => {
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={{ kind: "incorrect", reason: "no_match", userAnswer: "dog", expectedAnswer: "cat" }}
        awaitingAdvance
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    expect(screen.getByText("dog")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("explains a missing-article mistake specifically", () => {
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={{ kind: "incorrect", reason: "missing_article", article: "el", userAnswer: "gato", expectedAnswer: "el gato" }}
        awaitingAdvance
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    expect(screen.getByText(/requires the article/i)).toBeInTheDocument();
  });

  it("inserts an accent character at the caret without losing existing input", async () => {
    const user = userEvent.setup();
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={["ñ"]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Your answer" }) as HTMLInputElement;
    await user.type(input, "ni");
    await user.click(screen.getByRole("button", { name: "ñ" }));
    expect(input.value).toBe("niñ");
  });

  it("never disables the answer input, even while a request is pending — disabling forces a browser blur that breaks the Enter-to-advance flow", () => {
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={null}
        awaitingAdvance={false}
        characterHelpers={[]}
        isPending
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Your answer" });
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
  });

  it("keeps the answer input readOnly (not disabled) while awaiting advance", () => {
    render(
      <ReviewQuestionView
        question={QUESTION}
        feedback={{ kind: "correct" }}
        awaitingAdvance
        characterHelpers={[]}
        isPending={false}
        onSubmit={() => {}}
        onAdvance={() => {}}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Your answer" });
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
  });
});
