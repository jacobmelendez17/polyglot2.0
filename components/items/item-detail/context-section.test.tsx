import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ContextSection } from "@/components/items/item-detail/context-section";
import type { ItemDetailPatternView } from "@/domains/curriculum";

const patterns: ItemDetailPatternView[] = [
  {
    id: "pattern-1",
    label: "como",
    note: "first-person singular present",
    examples: [{ id: "example-1", targetText: "Como pan.", translation: "I eat bread.", spokenText: "Como pan." }],
  },
  {
    id: "pattern-2",
    label: "comes",
    note: null,
    examples: [{ id: "example-2", targetText: "Comes mucho.", translation: "You eat a lot.", spokenText: "Comes mucho." }],
  },
  { id: "pattern-3", label: "come", note: null, examples: [] },
];

describe("ContextSection", () => {
  it("lays out patterns beside the selected pattern's examples", () => {
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);

    expect(screen.getByText("Pattern of Use")).toBeInTheDocument();
    expect(screen.getByText("Common Combinations")).toBeInTheDocument();
    expect(screen.getByText("Como pan.")).toBeInTheDocument();
    expect(screen.getByText("first-person singular present")).toBeInTheDocument();
    expect(screen.queryByText("Comes mucho.")).not.toBeInTheDocument();
  });

  it("switches the examples when another pattern is selected", async () => {
    const user = userEvent.setup();
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);

    await user.click(screen.getByRole("tab", { name: "comes" }));

    expect(screen.getByText("Comes mucho.")).toBeInTheDocument();
    expect(screen.queryByText("Como pan.")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "comes" })).toHaveAttribute("aria-selected", "true");
  });

  it("still offers a pattern with no examples written for it yet", async () => {
    const user = userEvent.setup();
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);

    await user.click(screen.getByRole("tab", { name: "come" }));

    expect(screen.getByText("No examples for this pattern yet.")).toBeInTheDocument();
  });

  it("moves between patterns with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);

    screen.getByRole("tab", { name: "como" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("tab", { name: "comes" })).toHaveAttribute("aria-selected", "true");

    // Wraps backwards past the start, to the last pattern.
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("tab", { name: "come" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps only the selected pattern in the tab order", () => {
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);

    expect(screen.getByRole("tab", { name: "como" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "comes" })).toHaveAttribute("tabindex", "-1");
  });

  it("renders nothing at all when the item has no patterns", () => {
    const { container } = render(<ContextSection patterns={[]} languageCode="es-MX" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers audio for each example", () => {
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);
    expect(screen.getByRole("button", { name: /Como pan\./ })).toBeInTheDocument();
  });
});

describe("ContextSection — reduced motion", () => {
  it("does not depend on animation to reveal a pattern's examples", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    const user = userEvent.setup();
    render(<ContextSection patterns={patterns} languageCode="es-MX" />);

    await user.click(screen.getByRole("tab", { name: "comes" }));
    expect(screen.getByText("Comes mucho.")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
