import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CurriculumModePicker } from "@/components/curriculum/curriculum-mode-picker";
import type { LessonThemeChoice } from "@/domains/lessons";

const THEMES: LessonThemeChoice[] = [
  { id: "theme-numbers", name: "Numbers", remainingCount: 11 },
  { id: "theme-colors", name: "Colors", remainingCount: 8 },
];

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof CurriculumModePicker>> = {},
) {
  const props = {
    selectedMode: null,
    onSelectMode: vi.fn(),
    themes: THEMES,
    selectedThemeId: null,
    onSelectTheme: vi.fn(),
    ...overrides,
  };
  render(<CurriculumModePicker {...props} />);
  return props;
}

describe("CurriculumModePicker", () => {
  it("offers all three Learning Queue modes as one radio group", () => {
    renderPicker();
    const modes = screen.getAllByRole("radio", {
      name: /default order|theme selection|variety/i,
    });
    expect(modes).toHaveLength(3);
    expect(
      modes.every((radio) => radio.getAttribute("name") === "curriculum-mode"),
    ).toBe(true);
  });

  it("preselects nothing, so the learner answers rather than confirms a default", () => {
    renderPicker();
    expect(
      screen.queryByRole("radio", { checked: true }),
    ).not.toBeInTheDocument();
  });

  it("reports the chosen mode", async () => {
    const { onSelectMode } = renderPicker();
    await userEvent.click(
      screen.getByRole("radio", { name: /theme selection/i }),
    );
    expect(onSelectMode).toHaveBeenCalledWith("choose_group");
  });

  it("asks which group only in Theme Selection, and only when told to show it", () => {
    renderPicker({ selectedMode: "variety" });
    expect(
      screen.queryByRole("radio", { name: /Numbers/ }),
    ).not.toBeInTheDocument();
  });

  it("lists the available groups with what is left in each", async () => {
    const { onSelectTheme } = renderPicker({ selectedMode: "choose_group" });
    expect(screen.getByText("11 left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Colors/ }));
    expect(onSelectTheme).toHaveBeenCalledWith("theme-colors");
  });

  it("explains the wait instead of showing an empty group list", () => {
    renderPicker({ selectedMode: "choose_group", themes: [] });
    expect(
      screen.getByText(
        /pick your first theme when your first lesson is ready/i,
      ),
    ).toBeInTheDocument();
  });

  it("hides the group picker entirely when showThemeSelection is off, even with themes available (onboarding, 2026-09-27)", () => {
    renderPicker({ selectedMode: "choose_group", showThemeSelection: false });
    expect(screen.queryByRole("radio", { name: /Numbers/ })).toBeNull();
    expect(
      screen.queryByText(
        /pick your first theme when your first lesson is ready/i,
      ),
    ).toBeNull();
  });
});
