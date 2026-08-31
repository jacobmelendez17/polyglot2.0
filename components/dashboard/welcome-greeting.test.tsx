import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WelcomeGreeting } from "@/components/dashboard/welcome-greeting";

describe("WelcomeGreeting", () => {
  it("greets the supplied name", () => {
    render(<WelcomeGreeting name="Mateo" />);

    expect(screen.getByText(/Welcome back,/)).toBeInTheDocument();
    expect(screen.getByText("Mateo")).toBeInTheDocument();
  });
});
