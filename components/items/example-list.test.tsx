import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ExampleList } from "@/components/items/example-list";

describe("ExampleList", () => {
  it("renders nothing when there are no examples", () => {
    const { container } = render(<ExampleList examples={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each example's target text and translation", () => {
    render(
      <ExampleList
        examples={[
          { targetText: "El gato duerme.", translation: "The cat sleeps." },
          { targetText: "El gato come.", translation: "The cat eats." },
        ]}
      />,
    );

    expect(screen.getByText("El gato duerme.")).toBeInTheDocument();
    expect(screen.getByText("The cat sleeps.")).toBeInTheDocument();
    expect(screen.getByText("El gato come.")).toBeInTheDocument();
    expect(screen.getByText("The cat eats.")).toBeInTheDocument();
  });
});
