import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuditLogFilters } from "./audit-log-filters";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/logs",
}));

describe("AuditLogFilters", () => {
  it("renders each filter with its current value", () => {
    render(
      <AuditLogFilters
        value={{
          actorUserId: "dev-1",
          action: "CURRICULUM_ITEM_PUBLISHED",
          resourceType: "level",
          resourceId: "level-1",
          from: "2026-01-01",
          to: "2026-01-31",
        }}
      />,
    );

    expect(screen.getByPlaceholderText("Actor ID")).toHaveValue("dev-1");
    expect(screen.getByRole("combobox", { name: "Action" })).toHaveTextContent(
      "CURRICULUM_ITEM_PUBLISHED",
    );
    expect(screen.getByPlaceholderText("Resource type")).toHaveValue("level");
    expect(screen.getByPlaceholderText("Resource ID")).toHaveValue("level-1");
    expect(screen.getByLabelText("From date")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("To date")).toHaveValue("2026-01-31");
  });

  it("shows 'All actions' when no action filter is set", () => {
    render(<AuditLogFilters value={{}} />);
    expect(screen.getByRole("combobox", { name: "Action" })).toHaveTextContent(
      "All actions",
    );
  });

  it("submitting the text filters navigates with all three params", async () => {
    const user = userEvent.setup();
    render(<AuditLogFilters value={{}} />);

    await user.type(screen.getByPlaceholderText("Actor ID"), "dev-1");
    await user.type(screen.getByPlaceholderText("Resource type"), "level");
    await user.type(screen.getByPlaceholderText("Resource ID"), "level-1");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledWith(
      "/admin/logs?actor=dev-1&resourceType=level&resourceId=level-1",
    );
  });

  it("selecting an Action option navigates immediately with the new action", async () => {
    const user = userEvent.setup();
    render(<AuditLogFilters value={{}} />);

    await user.click(screen.getByRole("combobox", { name: "Action" }));
    await user.click(
      await screen.findByRole("option", { name: "GROUP_ARCHIVED" }),
    );

    expect(push).toHaveBeenCalledWith("/admin/logs?action=GROUP_ARCHIVED");
  });

  it("choosing a From date navigates immediately with the new date", async () => {
    render(<AuditLogFilters value={{}} />);

    const fromInput = screen.getByLabelText("From date");
    fromInput.dispatchEvent(new Event("focus"));
    // fireEvent.change is more reliable than user.type for a native date input across browsers/jsdom.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(fromInput, { target: { value: "2026-02-01" } });

    expect(push).toHaveBeenCalledWith("/admin/logs?from=2026-02-01");
  });
});
