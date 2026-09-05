import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminMobileNav } from "./admin-mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

describe("AdminMobileNav", () => {
  it("opens a sheet with every permitted nav item on trigger click", async () => {
    const user = userEvent.setup();
    render(<AdminMobileNav canManageCurriculum={false} />);

    const trigger = screen.getByRole("button", { name: "Open Admin navigation" });
    expect(trigger).toBeInTheDocument();
    // Sheet content isn't mounted until opened — regression guard for the
    // real bug this component's split fixed: the trigger must exist
    // outside any parent that's `hidden` at this viewport, and its content
    // must only ever be reachable through this trigger, not always-present.
    expect(screen.queryByRole("link", { name: "Sandbox" })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole("link", { name: "Sandbox" })).toHaveAttribute("href", "/admin/sandbox");
    expect(screen.queryByRole("link", { name: "Curriculum" })).not.toBeInTheDocument();
  });

  it("includes Curriculum when the user can manage curriculum", async () => {
    const user = userEvent.setup();
    render(<AdminMobileNav canManageCurriculum />);

    await user.click(screen.getByRole("button", { name: "Open Admin navigation" }));
    expect(screen.getByRole("link", { name: "Curriculum" })).toHaveAttribute("href", "/admin/curriculum");
  });
});
