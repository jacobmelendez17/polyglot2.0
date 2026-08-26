import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { Reveal } from "@/components/shared/reveal";

describe("Reveal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders children into the DOM when IntersectionObserver is undefined", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(
      <Reveal>
        <p>Revealed content</p>
      </Reveal>
    );

    const content = screen.getByText("Revealed content");
    expect(content).toBeInTheDocument();
    expect(content.parentElement).toHaveClass("opacity-100");
  });

  it("renders children visible when prefers-reduced-motion matches", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true })
    );

    render(
      <Reveal>
        <p>Reduced motion content</p>
      </Reveal>
    );

    const content = screen.getByText("Reduced motion content");
    expect(content).toBeInTheDocument();
    expect(content.parentElement).toHaveClass("opacity-100");
  });
});
