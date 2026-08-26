import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteHeader } from "@/components/shared/site-header";

describe("SiteHeader", () => {
  it("renders the wordmark and all four links with the expected hrefs", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("link", { name: "Polyglot" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Demo" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
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
