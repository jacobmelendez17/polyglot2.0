import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { LevelValidationResult } from "@/domains/curriculum";

import { LevelValidationSummary } from "./level-validation-summary";

function result(overrides: Partial<LevelValidationResult> = {}): LevelValidationResult {
  return {
    vocabularyItems: { actual: 47, expected: 48, satisfied: false },
    grammarItems: { actual: 12, expected: 12, satisfied: true },
    vocabularyGroups: { actual: 4, expected: 4, satisfied: true },
    allSatisfied: false,
    ...overrides,
  };
}

describe("LevelValidationSummary", () => {
  it("renders the spec's exact worked example (47/48 vocab, 12/12 grammar, 4/4 groups)", () => {
    render(<LevelValidationSummary validation={result()} />);

    expect(screen.getByText("Vocabulary")).toBeInTheDocument();
    expect(screen.getByText("47 / 48")).toBeInTheDocument();
    expect(screen.getByText("Grammar")).toBeInTheDocument();
    expect(screen.getByText("12 / 12")).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.getByText("4 / 4")).toBeInTheDocument();
  });

  it("communicates satisfied vs. unsatisfied with an icon and text together, never color alone", () => {
    render(<LevelValidationSummary validation={result()} />);

    expect(screen.getByLabelText("Not yet satisfied")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Satisfied")).toHaveLength(2);
  });

  it("shows every row satisfied once every count meets its target", () => {
    render(
      <LevelValidationSummary
        validation={result({
          vocabularyItems: { actual: 48, expected: 48, satisfied: true },
          allSatisfied: true,
        })}
      />,
    );

    expect(screen.queryByLabelText("Not yet satisfied")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Satisfied")).toHaveLength(3);
  });
});
