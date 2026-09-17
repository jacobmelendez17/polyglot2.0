import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SettingsSidebarNav } from "./settings-sidebar-nav";

let mockPathname = "/settings/account";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("SettingsSidebarNav", () => {
  it("renders every settings section", () => {
    mockPathname = "/settings/account";
    render(<SettingsSidebarNav />);

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/settings/account",
    );
    expect(screen.getByRole("link", { name: "General" })).toHaveAttribute(
      "href",
      "/settings/general",
    );
    expect(screen.getByRole("link", { name: "Lessons" })).toHaveAttribute(
      "href",
      "/settings/lessons",
    );
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute(
      "href",
      "/settings/reviews",
    );
    expect(screen.getByRole("link", { name: "Appearance" })).toHaveAttribute(
      "href",
      "/settings/appearance",
    );
    expect(screen.getByRole("link", { name: "Subscription" })).toHaveAttribute(
      "href",
      "/settings/subscription",
    );
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "href",
      "/settings/notifications",
    );
    expect(screen.getByRole("link", { name: "API" })).toHaveAttribute(
      "href",
      "/settings/api",
    );
    expect(screen.getByRole("link", { name: "Danger Zone" })).toHaveAttribute(
      "href",
      "/settings/danger",
    );
  });

  it("marks only the current section as aria-current", () => {
    mockPathname = "/settings/reviews";
    render(<SettingsSidebarNav />);

    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Account" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks the current section as active on a sub-route", () => {
    mockPathname = "/settings/danger/confirm";
    render(<SettingsSidebarNav />);

    expect(screen.getByRole("link", { name: "Danger Zone" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
