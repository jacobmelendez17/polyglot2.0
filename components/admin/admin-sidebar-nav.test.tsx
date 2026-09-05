import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AdminSidebarNav } from "./admin-sidebar-nav";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("AdminSidebarNav", () => {
  it("shows every nav item, including Curriculum, when the user can manage curriculum", () => {
    mockPathname = "/admin";
    render(<AdminSidebarNav canManageCurriculum />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Curriculum" })).toHaveAttribute("href", "/admin/curriculum");
    expect(screen.getByRole("link", { name: "Logs" })).toHaveAttribute("href", "/admin/logs");
    expect(screen.getByRole("link", { name: "Sandbox" })).toHaveAttribute("href", "/admin/sandbox");
  });

  it("omits Curriculum for a developer-only user", () => {
    mockPathname = "/admin";
    render(<AdminSidebarNav canManageCurriculum={false} />);

    expect(screen.queryByRole("link", { name: "Curriculum" })).not.toBeInTheDocument();
  });

  it("marks only the current route as aria-current", () => {
    mockPathname = "/admin/sandbox";
    render(<AdminSidebarNav canManageCurriculum />);

    expect(screen.getByRole("link", { name: "Sandbox" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });
});
