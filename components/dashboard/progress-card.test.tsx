import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProgressCard } from "@/components/dashboard/progress-card";
import type { DashboardData } from "@/domains/dashboard";

const stageProgress: DashboardData["stageProgress"] = [
  { stage: "beginner", label: "Beginner", vocabularyCount: 12, grammarCount: 3 },
  { stage: "familiar", label: "Familiar", vocabularyCount: 9, grammarCount: 2 },
  {
    stage: "intermediate",
    label: "Intermediate",
    vocabularyCount: 6,
    grammarCount: 1,
  },
  { stage: "master", label: "Master", vocabularyCount: 3, grammarCount: 1 },
  { stage: "fluent", label: "Fluent", vocabularyCount: 1, grammarCount: 0 },
];

describe("ProgressCard", () => {
  it("renders vocabulary counts by default, one tile per stage group", () => {
    render(<ProgressCard stageProgress={stageProgress} />);

    expect(screen.getByText("Beginner")).toBeInTheDocument();
    expect(screen.getByText("Familiar")).toBeInTheDocument();
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
    expect(screen.getByText("Master")).toBeInTheDocument();
    expect(screen.getByText("Fluent")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vocabulary" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches to grammar counts when toggled", async () => {
    const user = userEvent.setup();
    render(<ProgressCard stageProgress={stageProgress} />);

    await user.click(screen.getByRole("button", { name: "Grammar" }));

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grammar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
