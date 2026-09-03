import { describe, expect, it } from "vitest";

import { buildReviewItemCompletionPreview } from "./review-completion-preview";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("buildReviewItemCompletionPreview", () => {
  it("advances and schedules the next review from the resulting stage", () => {
    const preview = buildReviewItemCompletionPreview({
      itemId: "gato",
      stageBefore: "beginner_1",
      levelNumber: 1,
      hadIncorrectRequiredAnswer: false,
      now: NOW,
    });

    expect(preview.stageBefore).toBe("beginner_1");
    expect(preview.stageAfter).toBe("beginner_2");
    expect(preview.result).toBe("advanced");
    expect(preview.reachedFluent).toBe(false);
    // Level 1 -> accelerated beginner_2 interval is 4 hours (domains/srs/srs-config.ts).
    expect(preview.nextReviewAt).toEqual(new Date("2026-01-01T04:00:00Z"));
  });

  it("penalizes and reschedules from the penalized stage, not the pre-penalty one", () => {
    const preview = buildReviewItemCompletionPreview({
      itemId: "gato",
      stageBefore: "beginner_3",
      levelNumber: 3,
      hadIncorrectRequiredAnswer: true,
      now: NOW,
    });

    expect(preview.stageAfter).toBe("beginner_2");
    expect(preview.result).toBe("penalized");
    // Level 3+ standard beginner_2 interval is 8 hours.
    expect(preview.nextReviewAt).toEqual(new Date("2026-01-01T08:00:00Z"));
  });

  it("reaching Fluent has no further scheduled review", () => {
    const preview = buildReviewItemCompletionPreview({
      itemId: "gato",
      stageBefore: "master",
      levelNumber: 5,
      hadIncorrectRequiredAnswer: false,
      now: NOW,
    });

    expect(preview.stageAfter).toBe("fluent");
    expect(preview.reachedFluent).toBe(true);
    expect(preview.nextReviewAt).toBeNull();
  });
});
