import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeckPracticeIntro } from "@/components/decks/deck-practice-intro";

function renderIntro(overrides: Partial<Parameters<typeof DeckPracticeIntro>[0]> = {}) {
  const props = {
    deckName: "Kitchen words",
    itemCount: 12,
    questionCount: 24,
    knowDontKnowEnabled: false,
    onToggleKnowDontKnow: vi.fn(),
    onStart: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  render(<DeckPracticeIntro {...props} />);
  return props;
}

describe("DeckPracticeIntro", () => {
  it("names the deck and what the session will cover", () => {
    renderIntro();
    expect(screen.getByRole("heading", { name: "Kitchen words" })).toBeInTheDocument();
    expect(screen.getByText("12 items · 24 questions")).toBeInTheDocument();
  });

  it("leaves Know / Don't Know off by default, so the plain path is normal deck practice", () => {
    renderIntro();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("reports the toggle change to its parent", async () => {
    const user = userEvent.setup();
    const props = renderIntro();
    await user.click(screen.getByRole("checkbox"));
    expect(props.onToggleKnowDontKnow).toHaveBeenCalledWith(true);
  });

  it("tells the learner up front that practice will not touch their SRS progress", () => {
    renderIntro();
    expect(
      screen.getByText("Deck practice never changes your SRS stages, review times, or curriculum progress."),
    ).toBeInTheDocument();
  });

  it("offers a way out without starting", async () => {
    const user = userEvent.setup();
    const props = renderIntro();
    await user.click(screen.getByRole("button", { name: "Back to deck" }));
    expect(props.onExit).toHaveBeenCalled();
    expect(props.onStart).not.toHaveBeenCalled();
  });
});
