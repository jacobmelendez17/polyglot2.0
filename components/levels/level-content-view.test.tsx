import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LevelContentView } from "@/components/levels/level-content-view";
import type { LevelCardItem } from "@/domains/curriculum";

const GRAMMAR: LevelCardItem[] = [{ id: "y", itemType: "grammar", primary: "y", secondary: "and" }];
const VOCABULARY: LevelCardItem[] = [{ id: "gato", itemType: "vocabulary", primary: "gato", secondary: "cat" }];

beforeEach(() => {
  window.localStorage.clear();
});

describe("LevelContentView", () => {
  it("defaults to the normal grid", () => {
    const { container } = render(<LevelContentView grammar={GRAMMAR} vocabulary={VOCABULARY} />);
    expect(container.querySelector(".lg\\:grid-cols-8")).toBeInTheDocument();
  });

  it("switching to list mode renders list rows instead of the card grid, without touching which level is selected", async () => {
    const user = userEvent.setup();
    render(<LevelContentView grammar={GRAMMAR} vocabulary={VOCABULARY} />);

    await user.click(screen.getByRole("radio", { name: "List" }));

    // List rows render as plain links in a list, not inside a grid container.
    const links = screen.getAllByRole("link");
    expect(links.map((el) => el.getAttribute("href"))).toEqual(expect.arrayContaining(["/items/y", "/items/gato"]));
  });

  it("switching to large mode changes the grid's layout", async () => {
    const user = userEvent.setup();
    const { container } = render(<LevelContentView grammar={GRAMMAR} vocabulary={VOCABULARY} />);

    await user.click(screen.getByRole("radio", { name: "Larger cards" }));
    expect(container.querySelector(".lg\\:grid-cols-6")).toBeInTheDocument();
  });

  it("persists the chosen mode across remounts (a small per-viewer browser preference)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<LevelContentView grammar={GRAMMAR} vocabulary={VOCABULARY} />);
    await user.click(screen.getByRole("radio", { name: "Smaller cards" }));
    unmount();

    const { container } = render(<LevelContentView grammar={GRAMMAR} vocabulary={VOCABULARY} />);
    expect(container.querySelector(".lg\\:grid-cols-10")).toBeInTheDocument();
  });

  it("shows the empty-state message for a section with no items, and cards for the other", () => {
    render(<LevelContentView grammar={[]} vocabulary={VOCABULARY} />);
    expect(screen.getByText("No grammar items have been published for this level yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View gato — cat" })).toBeInTheDocument();
  });
});
