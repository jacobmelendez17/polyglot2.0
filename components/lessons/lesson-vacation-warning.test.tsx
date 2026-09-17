import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LessonVacationWarning } from "./lesson-vacation-warning";

describe("LessonVacationWarning", () => {
  it("explains that scheduling stays frozen and offers Cancel/Start Lesson", () => {
    render(<LessonVacationWarning />);

    expect(
      screen.getByText("You're currently in Vacation Mode."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/their review scheduling will remain frozen/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Start Lesson" })).toHaveAttribute(
      "href",
      "/lessons?vacationConfirmed=1",
    );
  });
});
