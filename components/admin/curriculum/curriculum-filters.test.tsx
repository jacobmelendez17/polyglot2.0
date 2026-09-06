import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CurriculumFilters } from "./curriculum-filters";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/curriculum",
}));

const LANGUAGES = [{ id: "lang-es", name: "Spanish" }];
const LEVELS = [
  { id: "level-1", levelNumber: 1 },
  { id: "level-2", levelNumber: 2 },
];
const GROUPS = [{ id: "group-1", name: "Home & Basics", levelNumber: 1 }];

function baseValue(overrides: Partial<React.ComponentProps<typeof CurriculumFilters>["value"]> = {}) {
  return { languageId: "lang-es", ...overrides };
}

describe("CurriculumFilters", () => {
  it("renders the search input and every filter with its current selection", () => {
    render(
      <CurriculumFilters
        languages={LANGUAGES}
        levels={LEVELS}
        groups={GROUPS}
        value={baseValue({ levelId: "level-2", type: "grammar", status: "pending", groupId: "group-1", search: "gato" })}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Search curriculum" })).toHaveValue("gato");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("Spanish");
    expect(screen.getByRole("combobox", { name: "Level" })).toHaveTextContent("Level 2");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Grammar");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("Pending");
    expect(screen.getByRole("combobox", { name: "Group" })).toHaveTextContent("Home & Basics");
  });

  it("shows 'All levels' etc. when no filter is set", () => {
    render(<CurriculumFilters languages={LANGUAGES} levels={LEVELS} groups={GROUPS} value={baseValue()} />);

    expect(screen.getByRole("combobox", { name: "Level" })).toHaveTextContent("All levels");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("All types");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("All statuses");
    expect(screen.getByRole("combobox", { name: "Group" })).toHaveTextContent("All groups");
  });

  it("submitting the search form navigates with the search param and resets any cursor", async () => {
    const user = userEvent.setup();
    render(
      <CurriculumFilters languages={LANGUAGES} levels={LEVELS} groups={GROUPS} value={baseValue({ levelId: "level-1" })} />,
    );

    const input = screen.getByRole("searchbox", { name: "Search curriculum" });
    await user.type(input, "gato");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/admin/curriculum?language=lang-es&level=level-1&search=gato");
  });

  it("selecting a Type option navigates with the new type and clears the cursor", async () => {
    const user = userEvent.setup();
    render(<CurriculumFilters languages={LANGUAGES} levels={LEVELS} groups={GROUPS} value={baseValue()} />);

    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Grammar" }));

    expect(push).toHaveBeenCalledWith("/admin/curriculum?language=lang-es&type=grammar");
  });

  it("selecting 'All levels' clears the level filter", async () => {
    const user = userEvent.setup();
    render(
      <CurriculumFilters languages={LANGUAGES} levels={LEVELS} groups={GROUPS} value={baseValue({ levelId: "level-1" })} />,
    );

    await user.click(screen.getByRole("combobox", { name: "Level" }));
    await user.click(await screen.findByRole("option", { name: "All levels" }));

    expect(push).toHaveBeenCalledWith("/admin/curriculum?language=lang-es");
  });
});
