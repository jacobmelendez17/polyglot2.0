import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonThemePicker } from "@/components/lessons/lesson-theme-picker";
import type { LessonThemeChoice } from "@/domains/lessons";

const chooseLessonThemeAction = vi.fn();
vi.mock("@/app/(focus)/lessons/actions", () => ({
  chooseLessonThemeAction: (...args: unknown[]) =>
    chooseLessonThemeAction(...args),
}));

// `LessonSessionView`/`LessonEmptyState` are heavy, fully-covered elsewhere —
// stubbed here so these tests verify the *hand-off* (which one renders, with
// what data), not their own internals.
vi.mock("@/components/lessons/lesson-session-view", () => ({
  LessonSessionView: ({ initial }: { initial: { token: string } }) => (
    <div data-testid="lesson-session-view">session:{initial.token}</div>
  ),
}));
vi.mock("@/components/lessons/lesson-empty-state", () => ({
  LessonEmptyState: () => <div data-testid="lesson-empty-state">empty</div>,
}));

const THEMES: LessonThemeChoice[] = [
  { id: "theme-numbers", name: "Numbers", remainingCount: 5, kind: "vocabulary" },
  { id: "theme-colors", name: "Colors", remainingCount: 3, kind: "vocabulary" },
];

beforeEach(() => {
  chooseLessonThemeAction.mockReset();
});

describe("LessonThemePicker", () => {
  it("disables Start lesson until a theme is picked", () => {
    render(<LessonThemePicker themes={THEMES} />);
    expect(screen.getByRole("button", { name: "Start lesson" })).toBeDisabled();
  });

  it("confirms the picked theme and renders the returned session directly, without navigating", async () => {
    chooseLessonThemeAction.mockResolvedValue({
      ok: true,
      data: { kind: "session", token: "t-numbers" },
    });

    const user = userEvent.setup();
    render(<LessonThemePicker themes={THEMES} />);

    await user.click(screen.getByText("Numbers"));
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    expect(chooseLessonThemeAction).toHaveBeenCalledWith({
      themeId: "theme-numbers",
    });
    await waitFor(() =>
      expect(screen.getByTestId("lesson-session-view")).toHaveTextContent(
        "session:t-numbers",
      ),
    );
  });

  it("renders the empty state when confirming leaves nothing to learn", async () => {
    chooseLessonThemeAction.mockResolvedValue({
      ok: true,
      data: { kind: "empty" },
    });

    const user = userEvent.setup();
    render(<LessonThemePicker themes={THEMES} />);

    await user.click(screen.getByText("Colors"));
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    await waitFor(() =>
      expect(screen.getByTestId("lesson-empty-state")).toBeInTheDocument(),
    );
  });

  it("shows an inline error and stays on the picker if the confirmed theme emptied out between listing and confirming", async () => {
    chooseLessonThemeAction.mockResolvedValue({
      ok: true,
      data: { kind: "choose-theme", themes: THEMES },
    });

    const user = userEvent.setup();
    render(<LessonThemePicker themes={THEMES} />);

    await user.click(screen.getByText("Numbers"));
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/emptied out/i),
    );
    expect(screen.getByText("Numbers")).toBeInTheDocument();
  });

  it("shows the server's error message on failure", async () => {
    chooseLessonThemeAction.mockResolvedValue({
      ok: false,
      error: { code: "THEME_UNAVAILABLE", message: "Not available anymore." },
    });

    const user = userEvent.setup();
    render(<LessonThemePicker themes={THEMES} />);

    await user.click(screen.getByText("Numbers"));
    await user.click(screen.getByRole("button", { name: "Start lesson" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Not available anymore.",
      ),
    );
  });
});
