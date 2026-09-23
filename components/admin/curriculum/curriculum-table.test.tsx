import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CurriculumTable } from "./curriculum-table";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

let currentSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => currentSearchParams,
}));

function item(
  overrides: Partial<AdminCurriculumListItem>,
): AdminCurriculumListItem {
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

const noop = () => {};

describe("CurriculumTable", () => {
  beforeEach(() => {
    currentSearchParams = new URLSearchParams();
  });

  it("renders each item's type, item, meaning, level, group, and status", () => {
    render(
      <CurriculumTable
        items={[item({})]}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );

    expect(screen.getByText("Vocab")).toBeInTheDocument();
    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Home & Basics")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("links the whole row to that item's editor, via its label", () => {
    currentSearchParams = new URLSearchParams();
    render(
      <CurriculumTable
        items={[item({})]}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );
    expect(screen.getByRole("link", { name: "el gato" })).toHaveAttribute(
      "href",
      "/admin/curriculum/items/item-1",
    );
  });

  it("carries the current filters through to the item editor as `from`, so Back can restore them", () => {
    currentSearchParams = new URLSearchParams("language=lang-es&level=level-1");
    render(
      <CurriculumTable
        items={[item({})]}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );
    expect(screen.getByRole("link", { name: "el gato" })).toHaveAttribute(
      "href",
      "/admin/curriculum/items/item-1?from=language%3Dlang-es%26level%3Dlevel-1",
    );
  });

  it("shows a dash for a grammar item's group, never a fabricated value", () => {
    render(
      <CurriculumTable
        items={[
          item({
            id: "item-2",
            type: "grammar",
            itemLabel: "porque",
            meaningLabel: "because",
            groupId: null,
            groupName: null,
          }),
        ]}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );

    expect(screen.getByText("Gram")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a designed empty state, not a blank table, when nothing matches", () => {
    render(
      <CurriculumTable
        items={[]}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );

    expect(
      screen.getByText("No curriculum items match these filters"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("reflects which rows are selected, including the header checkbox when every row is", () => {
    render(
      <CurriculumTable
        items={[
          item({ id: "item-1", itemLabel: "gato" }),
          item({ id: "item-2", itemLabel: "casa" }),
        ]}
        selectedIds={new Set(["item-1"])}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select gato" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select casa" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Select all items on this page" }),
    ).not.toBeChecked();
  });

  it("calls onToggleItem with that row's ID when its checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleItem = vi.fn();
    render(
      <CurriculumTable
        items={[item({ id: "item-1", itemLabel: "gato" })]}
        selectedIds={new Set()}
        onToggleItem={onToggleItem}
        onToggleAll={noop}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select gato" }));
    expect(onToggleItem).toHaveBeenCalledWith("item-1");
  });

  it("calls onToggleAll when the header checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleAll = vi.fn();
    render(
      <CurriculumTable
        items={[item({})]}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={onToggleAll}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Select all items on this page" }),
    );
    expect(onToggleAll).toHaveBeenCalled();
  });
});
