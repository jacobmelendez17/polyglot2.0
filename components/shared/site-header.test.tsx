import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteHeader } from "@/components/shared/site-header";

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: { signedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) =>
    (when === "signed-in") === mockAuthState.signedIn ? children : null,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  SignUpButton: ({ children }: { children: ReactNode }) => children,
  UserButton: () => <div data-testid="user-button" />,
}));

describe("SiteHeader", () => {
  beforeEach(() => {
    mockAuthState.signedIn = false;
  });

  it("renders the wordmark, nav links, and signed-out auth controls", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Polyglot" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Demo" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("renders a user button instead of sign-in/sign-up controls when signed in", () => {
    mockAuthState.signedIn = true;
    render(<SiteHeader />);

    expect(screen.getByTestId("user-button")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
  });

  it("toggles aria-expanded on the mobile trigger when opened", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the mobile menu and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("renders the skip link as the first focusable element", () => {
    const { container } = render(<SiteHeader />);

    const focusable = container.querySelectorAll("a, button, input, [tabindex]");
    expect(focusable[0]).toHaveTextContent("Skip to main content");
  });
});
