import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingsMobileNav } from "./settings-mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/account",
}));

describe("SettingsMobileNav", () => {
  it("reveals every settings section inside the sheet", async () => {
    const user = userEvent.setup();
    render(<SettingsMobileNav />);

    await user.click(
      screen.getByRole("button", { name: "Open Settings navigation" }),
    );

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(screen.getByRole("link", { name: "Danger Zone" })).toHaveAttribute(
      "href",
      "/settings/danger",
    );
  });
});
