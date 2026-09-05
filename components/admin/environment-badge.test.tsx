import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EnvironmentBadge } from "./environment-badge";

describe("EnvironmentBadge", () => {
  it("renders DEVELOPMENT for the development environment", () => {
    render(<EnvironmentBadge appEnv="development" />);
    expect(screen.getByText("DEVELOPMENT")).toBeInTheDocument();
  });

  it("renders PREVIEW for the preview environment", () => {
    render(<EnvironmentBadge appEnv="preview" />);
    expect(screen.getByText("PREVIEW")).toBeInTheDocument();
  });

  it("renders nothing in production", () => {
    const { container } = render(<EnvironmentBadge appEnv="production" />);
    expect(container).toBeEmptyDOMElement();
  });
});
