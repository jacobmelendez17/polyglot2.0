import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LevelContentSection } from "@/components/levels/level-content-section";

describe("LevelContentSection", () => {
  it("defaults to expanded with aria-expanded true", () => {
    render(
      <LevelContentSection title="Grammar">
        <p>content</p>
      </LevelContentSection>,
    );

    expect(screen.getByRole("button", { name: "Grammar" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("collapses on click, keeping the title visible and updating aria-expanded", async () => {
    const user = userEvent.setup();
    render(
      <LevelContentSection title="Vocabulary">
        <p>content</p>
      </LevelContentSection>,
    );

    const trigger = screen.getByRole("button", { name: "Vocabulary" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Vocabulary")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("expands again on a second click", async () => {
    const user = userEvent.setup();
    render(
      <LevelContentSection title="Grammar">
        <p>content</p>
      </LevelContentSection>,
    );

    const trigger = screen.getByRole("button", { name: "Grammar" });
    await user.click(trigger);
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
