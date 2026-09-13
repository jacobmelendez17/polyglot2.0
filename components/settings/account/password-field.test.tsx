import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordField } from "./password-field";
import { useUser } from "@clerk/nextjs";

vi.mock("@clerk/nextjs", () => ({
  useUser: vi.fn(),
}));

const mockUseUser = vi.mocked(useUser);

function buildMockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    passwordEnabled: true,
    updatePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("PasswordField", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
  });

  it("shows the Old Password field when the account already has a password credential", async () => {
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user: buildMockUser({ passwordEnabled: true }) });
    const user = userEvent.setup();
    render(<PasswordField />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Old Password")).toBeInTheDocument();
  });

  it("omits the Old Password field, and currentPassword from the request, when the account has no password credential yet", async () => {
    const updatePassword = vi.fn().mockResolvedValue(undefined);
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user: buildMockUser({ passwordEnabled: false, updatePassword }) });
    const user = userEvent.setup();
    render(<PasswordField />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("Old Password")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("New Password"), "a-strong-password-1");
    await user.type(screen.getByLabelText("Confirm New Password"), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updatePassword).toHaveBeenCalledWith({ newPassword: "a-strong-password-1" });
  });

  it("includes currentPassword in the request when the account already has a password", async () => {
    const updatePassword = vi.fn().mockResolvedValue(undefined);
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user: buildMockUser({ passwordEnabled: true, updatePassword }) });
    const user = userEvent.setup();
    render(<PasswordField />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Old Password"), "old-pass");
    await user.type(screen.getByLabelText("New Password"), "a-strong-password-1");
    await user.type(screen.getByLabelText("Confirm New Password"), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updatePassword).toHaveBeenCalledWith({ currentPassword: "old-pass", newPassword: "a-strong-password-1" });
  });

  it("refuses to submit when the new password and confirmation don't match, without calling Clerk", async () => {
    const updatePassword = vi.fn();
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user: buildMockUser({ updatePassword }) });
    const user = userEvent.setup();
    render(<PasswordField />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Old Password"), "old-pass");
    await user.type(screen.getByLabelText("New Password"), "one-password");
    await user.type(screen.getByLabelText("Confirm New Password"), "different-password");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("New password and confirmation don't match.")).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("surfaces a Clerk error without closing the dialog", async () => {
    const updatePassword = vi.fn().mockRejectedValue(new Error("weak password"));
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user: buildMockUser({ updatePassword }) });
    const user = userEvent.setup();
    render(<PasswordField />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Old Password"), "old-pass");
    await user.type(screen.getByLabelText("New Password"), "a-strong-password-1");
    await user.type(screen.getByLabelText("Confirm New Password"), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not change your password. Please try again.");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
