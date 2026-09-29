import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelProgressHeader } from "@/components/levels/level-progress-header";

describe("LevelProgressHeader", () => {
  it("identifies the current level and shows its content counts", () => {
    render(
      <LevelProgressHeader
        levelNumber={8}
        levelName={null}
        counts={{ grammarCount: 12, vocabularyCount: 48, lessonCount: 4 }}
        breakdown={{
          grammar: { qualifying: 3, total: 12 },
          vocabulary: { qualifying: 7, total: 36 },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Level 8" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("12 grammar points · 48 words · 4 lessons"),
    ).toBeInTheDocument();
  });

  it("shows the admin-authored level name when set, never a fabricated one", () => {
    render(
      <LevelProgressHeader
        levelNumber={1}
        levelName="Nivel Uno"
        counts={{ grammarCount: 0, vocabularyCount: 0, lessonCount: 0 }}
        breakdown={{
          grammar: { qualifying: 0, total: 0 },
          vocabulary: { qualifying: 0, total: 0 },
        }}
      />,
    );

    expect(screen.getByText("Nivel Uno")).toBeInTheDocument();
  });

  it("shows real Grammar and Vocabulary progress toward Familiar 1+", () => {
    render(
      <LevelProgressHeader
        levelNumber={1}
        levelName={null}
        counts={{ grammarCount: 12, vocabularyCount: 36, lessonCount: 3 }}
        breakdown={{
          grammar: { qualifying: 3, total: 12 },
          vocabulary: { qualifying: 7, total: 36 },
        }}
      />,
    );

    expect(screen.getByText("Grammar at Familiar 1+")).toBeInTheDocument();
    expect(screen.getByText("3/12")).toBeInTheDocument();
    expect(screen.getByText("Vocabulary at Familiar 1+")).toBeInTheDocument();
    expect(screen.getByText("7/36")).toBeInTheDocument();
  });

  it("omits a bar entirely for a type with no gating items, rather than showing 0/0", () => {
    render(
      <LevelProgressHeader
        levelNumber={1}
        levelName={null}
        counts={{ grammarCount: 0, vocabularyCount: 36, lessonCount: 3 }}
        breakdown={{
          grammar: { qualifying: 0, total: 0 },
          vocabulary: { qualifying: 7, total: 36 },
        }}
      />,
    );

    expect(
      screen.queryByText("Grammar at Familiar 1+"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Vocabulary at Familiar 1+")).toBeInTheDocument();
  });

  it("omits the whole progress panel when the level has no gating items at all", () => {
    render(
      <LevelProgressHeader
        levelNumber={1}
        levelName={null}
        counts={{ grammarCount: 0, vocabularyCount: 0, lessonCount: 0 }}
        breakdown={{
          grammar: { qualifying: 0, total: 0 },
          vocabulary: { qualifying: 0, total: 0 },
        }}
      />,
    );

    expect(screen.queryByText("Level progress")).not.toBeInTheDocument();
  });

  it("omits the count line entirely for an empty level", () => {
    render(
      <LevelProgressHeader
        levelNumber={1}
        levelName={null}
        counts={{ grammarCount: 0, vocabularyCount: 0, lessonCount: 0 }}
        breakdown={{
          grammar: { qualifying: 0, total: 0 },
          vocabulary: { qualifying: 0, total: 0 },
        }}
      />,
    );

    expect(screen.queryByText(/grammar point/)).not.toBeInTheDocument();
  });
});
