import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnswerInput } from "@/components/lessons/answer-input";

describe("AnswerInput", () => {
  it("renders with a bottom border only, no other borders/fill/radius/shadow", () => {
    render(<AnswerInput aria-label="Your answer" />);
    const input = screen.getByRole("textbox", { name: "Your answer" });

    expect(input.className).toMatch(/border-b-2/);
    expect(input.className).toMatch(/border-0/);
    expect(input.className).toMatch(/bg-transparent/);
    expect(input.className).toMatch(/rounded-none/);
    expect(input.className).not.toMatch(/shadow/);
  });

  it("thickens the border on the correct/incorrect state, not just recoloring it", () => {
    render(<AnswerInput aria-label="Your answer" state="incorrect" />);
    const input = screen.getByRole("textbox", { name: "Your answer" });
    expect(input.className).toMatch(/border-b-\[3px\]/);
    expect(input.className).toMatch(/border-destructive/);
  });
});
