import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AboutDefinition } from "@/components/items/item-detail/about-definition";
import { ExamplesSection } from "@/components/items/item-detail/examples-section";
import type { ItemDetailAboutView } from "@/domains/curriculum";

function about(overrides: Partial<ItemDetailAboutView> = {}): ItemDetailAboutView {
  return { title: "Definition", body: null, dictionarySenses: [], attribution: null, blocks: [], ...overrides };
}

describe("AboutDefinition", () => {
  it("keeps Polyglot's teaching text and dictionary senses in separate blocks", () => {
    render(
      <AboutDefinition
        about={about({
          body: "Polyglot's own explanation.",
          dictionarySenses: [{ id: "sense-1", gloss: "a small domesticated feline", tags: ["animal"] }],
          attribution: "From Wiktionary, CC BY-SA 4.0",
        })}
        languageCode="es-MX"
      />,
    );

    expect(screen.getByText("Polyglot's own explanation.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dictionary senses" })).toBeInTheDocument();
    // Attribution travels with the content it describes, not with Polyglot's.
    expect(screen.getByText("From Wiktionary, CC BY-SA 4.0")).toBeInTheDocument();
  });

  it("says an item has no explanation rather than rendering an empty card", () => {
    render(<AboutDefinition about={about()} languageCode="es-MX" />);
    expect(screen.getByText("No explanation has been written for this item yet.")).toBeInTheDocument();
  });

  it("renders the three grammar block types distinguishably", () => {
    render(
      <AboutDefinition
        about={about({
          title: "About ser",
          blocks: [
            { id: "block-1", position: 1, type: "text", body: "Use ser for identity." },
            { id: "block-2", position: 2, type: "example", targetText: "Soy alto.", translation: "I am tall." },
            { id: "block-3", position: 3, type: "note", body: "Not to be confused with estar." },
          ],
        })}
        languageCode="es-MX"
      />,
    );

    expect(screen.getByText("Use ser for identity.")).toBeInTheDocument();
    expect(screen.getByText("Soy alto.")).toBeInTheDocument();
    expect(screen.getByText("I am tall.")).toBeInTheDocument();
    expect(screen.getByText("Not to be confused with estar.")).toBeInTheDocument();
    // The note's nature is stated, not left to its yellow accent alone.
    expect(screen.getByText("Polyglot note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Soy alto\./ })).toBeInTheDocument();
  });
});

describe("ExamplesSection", () => {
  it("shows each sentence, its translation, and an audio control", () => {
    render(
      <ExamplesSection
        examples={[{ id: "example-1", targetText: "El gato duerme.", translation: "The cat sleeps.", spokenText: "El gato duerme." }]}
        languageCode="es-MX"
      />,
    );

    expect(screen.getByText("El gato duerme.")).toBeInTheDocument();
    expect(screen.getByText("The cat sleeps.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /El gato duerme\./ })).toBeInTheDocument();
  });

  it("says an item has no examples rather than rendering an empty list", () => {
    render(<ExamplesSection examples={[]} languageCode="es-MX" />);
    expect(screen.getByText("No example sentences for this item yet.")).toBeInTheDocument();
  });
});
