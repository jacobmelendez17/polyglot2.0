import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CurriculumPagination } from "./curriculum-pagination";

describe("CurriculumPagination", () => {
  it("renders a Next page link when there is a next page", () => {
    render(
      <CurriculumPagination nextHref="/admin/curriculum?language=lang-1&cursor=abc" />,
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/admin/curriculum?language=lang-1&cursor=abc",
    );
  });

  it("renders nothing when this is the last page", () => {
    const { container } = render(<CurriculumPagination nextHref={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
