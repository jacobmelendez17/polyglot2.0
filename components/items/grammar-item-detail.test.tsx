import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { GrammarItemDetail } from "@/components/items/grammar-item-detail";
import type { CurriculumGrammarDetail } from "@/domains/curriculum";

const grammar: CurriculumGrammarDetail = {
  title: "Ser vs. Estar",
  structure: "ser / estar",
  primaryMeaning: "to be",
  explanation: "Ser is for permanent traits; estar is for states and locations.",
  category: "Verbs",
  creatorNotes: "Contrast with plenty of examples.",
  requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
};

describe("GrammarItemDetail", () => {
  it("renders the grammar concept's title, explanation, category, examples, and notes", () => {
    render(
      <GrammarItemDetail
        grammar={grammar}
        levelNumber={3}
        status="published"
        examples={[{ targetText: "Estoy cansado.", translation: "I am tired." }]}
        progress={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Ser vs. Estar" })).toBeInTheDocument();
    expect(screen.getByText("to be")).toBeInTheDocument();
    expect(screen.getByText(/Ser is for permanent traits/)).toBeInTheDocument();
    expect(screen.getByText("Category: Verbs")).toBeInTheDocument();
    expect(screen.getByText("Estoy cansado.")).toBeInTheDocument();
    expect(screen.getByText("Contrast with plenty of examples.")).toBeInTheDocument();
  });

  it("falls back to the structure as the title when no title is set", () => {
    render(<GrammarItemDetail grammar={{ ...grammar, title: null }} levelNumber={3} status="published" examples={[]} progress={null} />);

    expect(screen.getByRole("heading", { name: "ser / estar" })).toBeInTheDocument();
  });
});
