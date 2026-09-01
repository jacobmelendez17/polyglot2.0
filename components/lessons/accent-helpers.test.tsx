import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccentHelpers } from "@/components/lessons/accent-helpers";

describe("AccentHelpers", () => {
  it("inserts the character when activated", async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<AccentHelpers characters={["á", "é", "ñ"]} onInsert={onInsert} />);

    await user.click(screen.getByRole("button", { name: "ñ" }));
    expect(onInsert).toHaveBeenCalledWith("ñ");
  });

  it("renders without a button or chip surface at rest — only a focus ring is a bordered treatment", () => {
    render(<AccentHelpers characters={["á"]} onInsert={() => {}} />);
    const button = screen.getByRole("button", { name: "á" });
    const restStateClasses = button.className
      .split(/\s+/)
      .filter((className) => !className.startsWith("hover:") && !className.startsWith("focus-visible:"));
    expect(restStateClasses.join(" ")).not.toMatch(/border|bg-|shadow/);
  });

  it("keeps a 44px touch target", () => {
    render(<AccentHelpers characters={["á"]} onInsert={() => {}} />);
    const button = screen.getByRole("button", { name: "á" });
    expect(button.className).toMatch(/h-11/);
    expect(button.className).toMatch(/w-11/);
  });

  it("renders nothing when the language has no configured helpers", () => {
    const { container } = render(<AccentHelpers characters={[]} onInsert={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
