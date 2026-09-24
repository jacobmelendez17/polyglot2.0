import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewCompletionView } from "@/components/reviews/review-completion-view";

const confetti = vi.hoisted(() => vi.fn());
vi.mock("canvas-confetti", () => ({ default: confetti }));

describe("ReviewCompletionView", () => {
  it("shows reviews completed and session accuracy", () => {
    render(
      <ReviewCompletionView
        stats={{
          itemsTotal: 5,
          itemsCompleted: 5,
          questionsAttempted: 11,
          questionsCorrect: 9,
        }}
      />,
    );

    expect(screen.getByText(/You completed 5 reviews/)).toBeInTheDocument();
    expect(screen.getAllByText("82%").length).toBeGreaterThan(0);
  });

  it("omits accuracy when nothing was attempted", () => {
    render(
      <ReviewCompletionView
        stats={{
          itemsTotal: 0,
          itemsCompleted: 0,
          questionsAttempted: 0,
          questionsCorrect: 0,
        }}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("greets in the language being learned, falling back to English", () => {
    const stats = {
      itemsTotal: 1,
      itemsCompleted: 1,
      questionsAttempted: 1,
      questionsCorrect: 1,
    };
    const { rerender } = render(
      <ReviewCompletionView stats={stats} languageCode="es-MX" />,
    );
    expect(screen.getByText("¡Felicidades!")).toBeInTheDocument();

    rerender(<ReviewCompletionView stats={stats} languageCode="xx" />);
    expect(screen.getByText("Congratulations!")).toBeInTheDocument();
  });

  it("lists each item with its sentence, translation, result and a link to the item", () => {
    render(
      <ReviewCompletionView
        stats={{
          itemsTotal: 2,
          itemsCompleted: 2,
          questionsAttempted: 3,
          questionsCorrect: 2,
        }}
        languageCode="es-MX"
        history={[
          {
            itemId: "gato",
            title: "gato",
            meaning: "cat",
            sentence: {
              targetText: "El gato duerme.",
              translation: "The cat sleeps.",
            },
            attempts: 1,
            correct: 1,
          },
          {
            itemId: "perro",
            title: "perro",
            meaning: "dog",
            sentence: null,
            attempts: 2,
            correct: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText("El gato duerme.")).toBeInTheDocument();
    expect(screen.getByText("The cat sleeps.")).toBeInTheDocument();
    // No sentence: falls back to the word and its meaning.
    expect(screen.getByText("perro")).toBeInTheDocument();
    expect(screen.getByLabelText("Correct")).toBeInTheDocument();
    expect(screen.getByLabelText("Incorrect")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /View item/ })[0],
    ).toHaveAttribute("href", "/items/gato");
  });

  it("only fires confetti when the session was finished, not ended early", () => {
    const stats = {
      itemsTotal: 1,
      itemsCompleted: 0,
      questionsAttempted: 0,
      questionsCorrect: 0,
    };
    confetti.mockClear();
    render(<ReviewCompletionView stats={stats} endedEarly />);
    expect(confetti).not.toHaveBeenCalled();
  });

  it("provides a route back to the dashboard", () => {
    render(
      <ReviewCompletionView
        stats={{
          itemsTotal: 1,
          itemsCompleted: 1,
          questionsAttempted: 2,
          questionsCorrect: 2,
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: /return to dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
