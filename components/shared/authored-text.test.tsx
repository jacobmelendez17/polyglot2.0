import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AuthoredText } from "@/components/shared/authored-text";

function renderText(text: string) {
  return render(
    <p data-testid="out">
      <AuthoredText text={text} />
    </p>,
  );
}

describe("AuthoredText", () => {
  it("drops the ticks and makes the word bold and green", () => {
    renderText("Use 'también' before the verb.");

    const word = screen.getByText("también");
    expect(word.tagName).toBe("STRONG");
    expect(word).toHaveClass("font-bold", "text-state-success");
    expect(screen.getByTestId("out")).toHaveTextContent(
      "Use también before the verb.",
    );
  });

  it("handles several emphasized words, including a phrase", () => {
    renderText("'Yo' también 'quiero ir'.");

    expect(screen.getByText("Yo").tagName).toBe("STRONG");
    expect(screen.getByText("quiero ir").tagName).toBe("STRONG");
    expect(screen.getByTestId("out")).toHaveTextContent(
      "Yo también quiero ir.",
    );
  });

  it("leaves apostrophes inside words alone", () => {
    renderText("It's what they don't say, l'amour.");

    expect(screen.getByTestId("out")).toHaveTextContent(
      "It's what they don't say, l'amour.",
    );
    expect(screen.queryByText(/./, { selector: "strong" })).toBeNull();
  });

  it("leaves a single unmatched tick alone", () => {
    renderText("Say 'hola to everyone");

    expect(screen.getByTestId("out")).toHaveTextContent(
      "Say 'hola to everyone",
    );
  });

  it("never renders markup from the text", () => {
    renderText("'<b>x</b>'");

    expect(screen.getByText("<b>x</b>").tagName).toBe("STRONG");
  });
});
