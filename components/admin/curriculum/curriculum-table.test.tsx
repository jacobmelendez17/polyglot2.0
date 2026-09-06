import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CurriculumTable } from "./curriculum-table";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

function item(overrides: Partial<AdminCurriculumListItem>): AdminCurriculumListItem {
  return {
    id: "item-1",
    type: "vocabulary",
    status: "published",
    languageId: "lang-1",
    levelId: "level-1",
    levelNumber: 1,
    position: 1,
    itemLabel: "el gato",
    meaningLabel: "cat",
    groupId: "group-1",
    groupName: "Home & Basics",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("CurriculumTable", () => {
  it("renders each item's type, item, meaning, level, group, and status", () => {
    render(<CurriculumTable items={[item({})]} />);

    expect(screen.getByText("Vocab")).toBeInTheDocument();
    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Home & Basics")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("shows a dash for a grammar item's group, never a fabricated value", () => {
    render(
      <CurriculumTable
        items={[item({ id: "item-2", type: "grammar", itemLabel: "porque", meaningLabel: "because", groupId: null, groupName: null })]}
      />,
    );

    expect(screen.getByText("Gram")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a designed empty state, not a blank table, when nothing matches", () => {
    render(<CurriculumTable items={[]} />);

    expect(screen.getByText("No curriculum items match these filters")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
