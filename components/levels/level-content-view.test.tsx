import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LevelContentView } from "@/components/levels/level-content-view";
import type { LevelCardItem, LevelLessonSection } from "@/domains/curriculum";

const GRAMMAR: LevelCardItem[] = [
  {
    id: "y",
    itemType: "grammar",
    primary: "y",
    secondary: "and",
    srsStage: null,
    displayState: "locked",
  },
];
const LESSONS: LevelLessonSection[] = [
  {
    groupId: "group-1",
    lessonNumber: 1,
    name: "Home & Basics",
    items: [
      {
        id: "gato",
        itemType: "vocabulary",
        primary: "gato",
        secondary: "cat",
        srsStage: null,
        displayState: "inLesson",
      },
    ],
    qualifyingCount: 0,
  },
];

beforeEach(() => {
  window.localStorage.clear();
});

describe("LevelContentView", () => {
  it("defaults to the normal grid", () => {
    const { container } = render(
      <LevelContentView grammar={GRAMMAR} lessons={LESSONS} />,
    );
    expect(container.querySelector(".lg\\:grid-cols-8")).toBeInTheDocument();
  });

  it("switching to list mode renders list rows instead of the card grid, without touching which level is selected", async () => {
    const user = userEvent.setup();
    render(<LevelContentView grammar={GRAMMAR} lessons={LESSONS} />);

    await user.click(screen.getByRole("radio", { name: "List" }));

    // List rows render as plain links in a list, not inside a grid container.
    const links = screen.getAllByRole("link");
    expect(links.map((el) => el.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/items/y", "/items/gato"]),
    );
  });

  it("switching to large mode changes the grid's layout", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LevelContentView grammar={GRAMMAR} lessons={LESSONS} />,
    );

    await user.click(screen.getByRole("radio", { name: "Larger cards" }));
    expect(container.querySelector(".lg\\:grid-cols-6")).toBeInTheDocument();
  });

  it("persists the chosen mode across remounts (a small per-viewer browser preference)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <LevelContentView grammar={GRAMMAR} lessons={LESSONS} />,
    );
    await user.click(screen.getByRole("radio", { name: "Smaller cards" }));
    unmount();

    const { container } = render(
      <LevelContentView grammar={GRAMMAR} lessons={LESSONS} />,
    );
    expect(container.querySelector(".lg\\:grid-cols-10")).toBeInTheDocument();
  });

  it("shows the empty-state message for a section with no items, and cards for the other", () => {
    render(<LevelContentView grammar={[]} lessons={LESSONS} />);
    expect(
      screen.getByText(
        "No grammar items have been published for this level yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View gato — cat" }),
    ).toBeInTheDocument();
  });

  it("shows the vocabulary empty state when there are no lessons at all", () => {
    render(<LevelContentView grammar={GRAMMAR} lessons={[]} />);
    expect(
      screen.getByText(
        "No vocabulary items have been published for this level yet.",
      ),
    ).toBeInTheDocument();
  });

  it("renders each lesson as its own titled section with a Familiar+ count", () => {
    render(<LevelContentView grammar={GRAMMAR} lessons={LESSONS} />);
    expect(
      screen.getByRole("button", { name: /Lesson 1 — Home & Basics/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 word")).toBeInTheDocument();
    expect(screen.getByText("0 of 1 at Familiar+")).toBeInTheDocument();
  });

  it("filters to only the selected content type", async () => {
    const user = userEvent.setup();
    render(<LevelContentView grammar={GRAMMAR} lessons={LESSONS} />);

    await user.click(screen.getByRole("radio", { name: "Grammar" }));
    expect(
      screen.queryByRole("button", { name: /Lesson 1/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grammar" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Vocabulary" }));
    expect(
      screen.queryByRole("button", { name: "Grammar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Lesson 1/ }),
    ).toBeInTheDocument();
  });
});
