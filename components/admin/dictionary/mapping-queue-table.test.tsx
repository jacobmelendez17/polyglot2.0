import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MappingQueueTable, isConfirmableMappingRow } from "./mapping-queue-table";
import type { MappingQueueRow } from "@/domains/lexicon";

function row(overrides: Partial<MappingQueueRow> = {}): MappingQueueRow {
  return {
    vocabularyItemId: "item-1",
    displayWord: "el gato",
    translation: "cat",
    levelNumber: 1,
    groupName: "Home & Basics",
    curriculumPartOfSpeech: "noun",
    lookupForm: "gato",
    matchStatus: "auto_matched",
    confidence: "high",
    reviewReason: null,
    manualLock: false,
    entryId: "entry-1",
    entryLemma: "gato",
    entryPartOfSpeech: "noun",
    regionalStatus: null,
    ...overrides,
  };
}

const noop = () => {};

describe("isConfirmableMappingRow", () => {
  it("is true when a mapping exists and isn't already confirmed", () => {
    expect(isConfirmableMappingRow(row())).toBe(true);
  });

  it("is false with nothing matched", () => {
    expect(isConfirmableMappingRow(row({ entryId: null, matchStatus: "unmatched" }))).toBe(false);
  });

  it("is false once already confirmed (manual)", () => {
    expect(isConfirmableMappingRow(row({ matchStatus: "manual" }))).toBe(false);
  });
});

describe("MappingQueueTable", () => {
  it("renders no checkbox column at all when selection props are omitted — every existing caller's shape", () => {
    render(<MappingQueueTable rows={[row()]} regionCode={null} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders a checkbox only for a confirmable row, not one with nothing matched", () => {
    render(
      <MappingQueueTable
        rows={[row({ vocabularyItemId: "item-1", displayWord: "el gato" }), row({ vocabularyItemId: "item-2", displayWord: "la casa", entryId: null, matchStatus: "unmatched" })]}
        regionCode={null}
        selectedIds={new Set()}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select el gato" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select la casa" })).not.toBeInTheDocument();
  });

  it("reflects selection state per row and in the header checkbox", () => {
    render(
      <MappingQueueTable
        rows={[row({ vocabularyItemId: "item-1", displayWord: "el gato" }), row({ vocabularyItemId: "item-2", displayWord: "la casa" })]}
        regionCode={null}
        selectedIds={new Set(["item-1"])}
        onToggleItem={noop}
        onToggleAll={noop}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Select el gato" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select la casa" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select all confirmable rows on this page" })).not.toBeChecked();
  });

  it("calls onToggleItem with that row's vocabulary item id when clicked", async () => {
    const user = userEvent.setup();
    const onToggleItem = vi.fn();
    render(<MappingQueueTable rows={[row()]} regionCode={null} selectedIds={new Set()} onToggleItem={onToggleItem} onToggleAll={noop} />);

    await user.click(screen.getByRole("checkbox", { name: "Select el gato" }));
    expect(onToggleItem).toHaveBeenCalledWith("item-1");
  });

  it("calls onToggleAll when the header checkbox is clicked", async () => {
    const user = userEvent.setup();
    const onToggleAll = vi.fn();
    render(<MappingQueueTable rows={[row()]} regionCode={null} selectedIds={new Set()} onToggleItem={noop} onToggleAll={onToggleAll} />);

    await user.click(screen.getByRole("checkbox", { name: "Select all confirmable rows on this page" }));
    expect(onToggleAll).toHaveBeenCalled();
  });
});
