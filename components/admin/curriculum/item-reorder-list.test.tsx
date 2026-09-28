import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ItemReorderList } from "@/components/admin/curriculum/item-reorder-list";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({
  reorderItemsAction: vi.fn(),
}));

function makeItem(
  overrides: Partial<AdminCurriculumListItem>,
): AdminCurriculumListItem {
  return {
    id: "item-a",
    type: "vocabulary",
    status: "published",
    languageId: "lang-1",
    levelId: "level-1",
    levelNumber: 1,
    position: 1,
    itemLabel: "gato",
    meaningLabel: "cat",
    groupId: null,
    groupName: null,
    updatedAt: new Date("2026-09-27T00:00:00.000Z"),
    needsDefinition: false,
    needsExamples: false,
    needsIpa: false,
    needsPronunciation: false,
    needsSynonyms: false,
    needsVariations: false,
    ...overrides,
  };
}

describe("ItemReorderList", () => {
  it("shows the new level/type scope's items after switching, not stale rows from the previous scope", () => {
    const level1Items = [makeItem({ id: "l1-a", itemLabel: "gato" })];
    const level2Items = [
      makeItem({ id: "l2-a", levelId: "level-2", itemLabel: "perro" }),
    ];

    const { rerender } = render(
      <ItemReorderList
        key="level-1-vocabulary"
        levelId="level-1"
        type="vocabulary"
        items={level1Items}
      />,
    );
    expect(screen.getByText("gato")).toBeInTheDocument();

    // Mirrors app/(admin)/admin/curriculum/page.tsx's `key` on this
    // component — see that render site's comment for the full explanation
    // of why the key is required (same root cause as GroupReorderList's).
    rerender(
      <ItemReorderList
        key="level-2-vocabulary"
        levelId="level-2"
        type="vocabulary"
        items={level2Items}
      />,
    );

    expect(screen.queryByText("gato")).not.toBeInTheDocument();
    expect(screen.getByText("perro")).toBeInTheDocument();
  });
});
