import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EmailField } from "./email-field";
import { useUser } from "@clerk/nextjs";

vi.mock("@clerk/nextjs", () => ({
  useUser: vi.fn(),
}));

const mockUseUser = vi.mocked(useUser);

function buildPendingEmailAddress(overrides: Partial<{ prepareVerification: ReturnType<typeof vi.fn>; attemptVerification: ReturnType<typeof vi.fn> }> = {}) {
  return {
    id: "email_new",
    emailAddress: "new@example.com",
    prepareVerification: vi.fn().mockResolvedValue(undefined),
    attemptVerification: vi.fn().mockResolvedValue({ id: "email_new" }),
    ...overrides,
  };
}

function buildMockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    primaryEmailAddress: { emailAddress: "old@example.com" },
    createEmailAddress: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("EmailField", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
  });

  it("shows a loading skeleton while Clerk hasn't loaded yet", () => {
    // @ts-expect-error - only the fields this component reads are relevant to the test
    mockUseUser.mockReturnValue({ isLoaded: false, user: undefined });
    render(<EmailField />);

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.queryByText("old@example.com")).not.toBeInTheDocument();
  });

  it("shows the current primary email with an Edit action", () => {
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user: buildMockUser() });
    render(<EmailField />);

    expect(screen.getByText("old@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("sends a verification code, then verifies it and makes the new address primary", async () => {
    const pending = buildPendingEmailAddress();
    const user = buildMockUser({ createEmailAddress: vi.fn().mockResolvedValue(pending) });
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    const testUser = userEvent.setup();
    render(<EmailField />);

    await testUser.click(screen.getByRole("button", { name: "Edit" }));
    await testUser.type(screen.getByLabelText("New email address"), "new@example.com");
    await testUser.click(screen.getByRole("button", { name: "Send Verification Code" }));

    expect(user.createEmailAddress).toHaveBeenCalledWith({ email: "new@example.com" });
    expect(await screen.findByLabelText(/Verification code sent to/)).toBeInTheDocument();
    expect(pending.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });

    await testUser.type(screen.getByLabelText(/Verification code sent to/), "123456");
    await testUser.click(screen.getByRole("button", { name: "Verify" }));

    expect(pending.attemptVerification).toHaveBeenCalledWith({ code: "123456" });
    expect(user.update).toHaveBeenCalledWith({ primaryEmailAddressId: "email_new" });
    expect(user.reload).toHaveBeenCalled();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows a Clerk error and stays on the email step when sending a code fails", async () => {
    const user = buildMockUser({
      createEmailAddress: vi.fn().mockRejectedValue(new Error("network down")),
    });
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    const testUser = userEvent.setup();
    render(<EmailField />);

    await testUser.click(screen.getByRole("button", { name: "Edit" }));
    await testUser.type(screen.getByLabelText("New email address"), "new@example.com");
    await testUser.click(screen.getByRole("button", { name: "Send Verification Code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send a verification code. Please try again.");
    expect(screen.getByLabelText("New email address")).toBeInTheDocument();
  });

  it("Cancel returns to the display state without calling Clerk", async () => {
    const user = buildMockUser();
    // @ts-expect-error - partial mock
    mockUseUser.mockReturnValue({ isLoaded: true, user });
    const testUser = userEvent.setup();
    render(<EmailField />);

    await testUser.click(screen.getByRole("button", { name: "Edit" }));
    await testUser.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("old@example.com")).toBeInTheDocument();
    expect(user.createEmailAddress).not.toHaveBeenCalled();
  });
});
