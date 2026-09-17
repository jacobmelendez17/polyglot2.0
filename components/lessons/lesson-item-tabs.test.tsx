import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonItemTabs } from "@/components/lessons/lesson-item-tabs";
import { FIXTURE_LEARNING_ITEMS } from "@/domains/curriculum";
import type { VocabularyItem } from "@/domains/curriculum";

const gato = FIXTURE_LEARNING_ITEMS.find(
  (item) => item.id === "vocab-gato",
)! as VocabularyItem;

describe("LessonItemTabs", () => {
  it("switches between Details, Examples, and Resources", async () => {
    const user = userEvent.setup();
    render(<LessonItemTabs item={gato} languageCode="es-MX" />);

    expect(screen.getByText("Definition")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Examples" }));
    expect(screen.getByText("El gato duerme.")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Resources" }));
    expect(
      screen.getByText("No additional resources for this item."),
    ).toBeVisible();
  });

  it("renders a real, honestly-disabled pronunciation control rather than a dead button when neither a recording nor synthesis is available", () => {
    render(<LessonItemTabs item={gato} languageCode="es-MX" />);
    // jsdom implements no speech synthesis and the fixture has no `audioUrl`
    // — the same "browser cannot pronounce this" case `PronunciationButton`
    // is built to handle (see `components/shared/pronunciation-button.test.tsx`).
    const button = screen.getByRole("button", {
      name: "Pronunciation of gato is unavailable in this browser",
    });
    expect(button).toBeDisabled();
  });

  it("renders the dictionary information section when a confirmed mapping's data is present", () => {
    const gatoWithDictionary: typeof gato = {
      ...gato,
      dictionary: {
        lemma: "gato",
        synonyms: ["minino"],
        variants: ["gatos"],
        usageLabels: ["colloquial"],
        regionalEvidence: [
          { regionCode: "es-MX", status: "recognized", matchedForm: "gato" },
        ],
        attributionText: "From Wiktionary, CC BY-SA 4.0",
      },
    };
    render(<LessonItemTabs item={gatoWithDictionary} languageCode="es-MX" />);

    expect(screen.getByText("Dictionary information")).toBeVisible();
    expect(screen.getByText("colloquial")).toBeVisible();
    expect(screen.getByText(/minino/)).toBeVisible();
    expect(screen.getByText(/gatos/)).toBeVisible();
    expect(screen.getByText("es-MX: Recognized")).toBeVisible();
    expect(screen.getByText("From Wiktionary, CC BY-SA 4.0")).toBeVisible();
  });

  it("omits the dictionary section entirely when the item has no confirmed mapping", () => {
    render(<LessonItemTabs item={gato} languageCode="es-MX" />);
    expect(
      screen.queryByText("Dictionary information"),
    ).not.toBeInTheDocument();
  });
});
