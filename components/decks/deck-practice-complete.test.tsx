import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeckPracticeComplete } from "@/components/decks/deck-practice-complete";
import type { DeckPracticeSummary } from "@/domains/decks";

const SUMMARY: DeckPracticeSummary = {
  knowCount: 2,
  dontKnowCount: 1,
  know: [
    { learningItemId: "v1", itemLabel: "el gato", verdict: "know" },
    { learningItemId: "g1", itemLabel: "y", verdict: "know" },
  ],
  dontKnow: [
    { learningItemId: "v2", itemLabel: "la casa", verdict: "dont_know" },
  ],
};

describe("DeckPracticeComplete", () => {
  it("shows the Deck Complete summary with session accuracy", () => {
    render(
      <DeckPracticeComplete
        deckId="deck-1"
        questionsAttempted={10}
        questionsCorrect={8}
        summary={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Deck Complete" }),
    ).toBeInTheDocument();
    expect(screen.getByText("8 of 10 correct · 80%")).toBeInTheDocument();
  });

  it("omits the Know / Don't Know breakdown when the toggle was off", () => {
    render(
      <DeckPracticeComplete
        deckId="deck-1"
        questionsAttempted={4}
        questionsCorrect={4}
        summary={null}
      />,
    );
    expect(screen.queryByText("Know")).not.toBeInTheDocument();
    expect(screen.queryByText("Don’t Know")).not.toBeInTheDocument();
  });

  it("shows the Know / Don't Know counts when the toggle was on", () => {
    render(
      <DeckPracticeComplete
        deckId="deck-1"
        questionsAttempted={6}
        questionsCorrect={5}
        summary={SUMMARY}
      />,
    );
    expect(screen.getByText("Know")).toBeInTheDocument();
    expect(screen.getByText("Don’t Know")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Know (2)" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Don’t Know (1)" }),
    ).toBeInTheDocument();
  });

  it("groups the result list by verdict", async () => {
    const user = userEvent.setup();
    render(
      <DeckPracticeComplete
        deckId="deck-1"
        questionsAttempted={6}
        questionsCorrect={5}
        summary={SUMMARY}
      />,
    );

    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.queryByText("la casa")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Don’t Know (1)" }));

    expect(screen.getByText("la casa")).toBeInTheDocument();
    expect(screen.queryByText("el gato")).not.toBeInTheDocument();
  });

  it("states that the classification is not saved", () => {
    render(
      <DeckPracticeComplete
        deckId="deck-1"
        questionsAttempted={6}
        questionsCorrect={5}
        summary={SUMMARY}
      />,
    );
    expect(
      screen.getByText("These results are not saved."),
    ).toBeInTheDocument();
  });

  it("offers a way back to the deck it practiced", () => {
    render(
      <DeckPracticeComplete
        deckId="deck-1"
        questionsAttempted={1}
        questionsCorrect={1}
        summary={null}
      />,
    );
    expect(screen.getByRole("link", { name: "Back to deck" })).toHaveAttribute(
      "href",
      "/decks/deck-1",
    );
  });
});
