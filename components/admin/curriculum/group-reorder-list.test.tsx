import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { GroupReorderList } from "@/components/admin/curriculum/group-reorder-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(admin)/admin/curriculum/actions", () => ({
  reorderVocabularyGroupsAction: vi.fn(),
}));

const LEVEL_1_GROUPS = [
  { id: "l1-a", name: "Numbers", status: "published" as const },
  { id: "l1-b", name: "Colors", status: "published" as const },
];

const LEVEL_2_GROUPS = [
  { id: "l2-a", name: "Common Verbs", status: "draft" as const },
  { id: "l2-b", name: "Descriptions", status: "published" as const },
];

describe("GroupReorderList", () => {
  it("shows the new level's groups after switching levels, not stale rows from the previous level", () => {
    const { rerender } = render(
      <GroupReorderList
        key="level-1"
        levelId="level-1"
        groups={LEVEL_1_GROUPS}
      />,
    );
    expect(screen.getByText("Numbers")).toBeInTheDocument();

    // Mirrors how the real page (app/(admin)/admin/curriculum/groups/page.tsx)
    // remounts this component with `key={levelId}` when the level filter
    // changes. Without that key, the component instance would survive this
    // re-render and its own `order` state — a lazy `useState` initializer
    // that only ever runs once — would still hold Level 1's group ids, none
    // of which exist in Level 2's id→group map, so every row would silently
    // render as null instead of showing Level 2's real, published groups.
    rerender(
      <GroupReorderList
        key="level-2"
        levelId="level-2"
        groups={LEVEL_2_GROUPS}
      />,
    );

    expect(screen.queryByText("Numbers")).not.toBeInTheDocument();
    expect(screen.getByText("Common Verbs")).toBeInTheDocument();
    expect(screen.getByText("Descriptions")).toBeInTheDocument();
  });

  it("shows the empty-level message rather than a blank list when a level genuinely has no groups", () => {
    render(<GroupReorderList key="level-3" levelId="level-3" groups={[]} />);

    expect(
      screen.getByText("No vocabulary groups yet in this level."),
    ).toBeInTheDocument();
  });
});
