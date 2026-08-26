import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewPreviewSection } from "@/components/marketing/review-preview-section";

describe("ReviewPreviewSection", () => {
  it("renders the mock answer input as readOnly", () => {
    render(<ReviewPreviewSection />);

    expect(screen.getByLabelText("Answer")).toHaveAttribute("readonly");
  });
});
