import { describe, expect, it } from "vitest";

import { formatNextReviewLabel } from "./format-next-review";

const NOW = new Date("2026-09-10T12:00:00.000Z");

describe("formatNextReviewLabel", () => {
  it("says the review is due now for a past or present target", () => {
    expect(
      formatNextReviewLabel(new Date("2026-09-10T11:59:00.000Z"), NOW, "UTC"),
    ).toBe("Due now");
    expect(formatNextReviewLabel(NOW, NOW, "UTC")).toBe("Due now");
  });

  it("says less than a minute under 60 seconds out", () => {
    expect(
      formatNextReviewLabel(new Date("2026-09-10T12:00:30.000Z"), NOW, "UTC"),
    ).toBe("~ Less than a minute");
  });

  it("counts minutes under an hour out, pluralized correctly", () => {
    expect(
      formatNextReviewLabel(new Date("2026-09-10T12:01:00.000Z"), NOW, "UTC"),
    ).toBe("1 minute");
    expect(
      formatNextReviewLabel(new Date("2026-09-10T12:30:00.000Z"), NOW, "UTC"),
    ).toBe("30 minutes");
  });

  it("counts hours under a day out, pluralized correctly", () => {
    expect(
      formatNextReviewLabel(new Date("2026-09-10T13:00:00.000Z"), NOW, "UTC"),
    ).toBe("1 hour");
    expect(
      formatNextReviewLabel(new Date("2026-09-10T18:00:00.000Z"), NOW, "UTC"),
    ).toBe("6 hours");
  });

  it("shows the plain date a day or more out", () => {
    expect(
      formatNextReviewLabel(new Date("2026-09-12T12:00:00.000Z"), NOW, "UTC"),
    ).toBe("Sep 12, 2026");
  });

  it("rounds the display number without ever printing 60 minutes or 24 hours", () => {
    // 59.6 minutes out rounds to 60 minutes, which should read as an hour instead.
    expect(
      formatNextReviewLabel(new Date("2026-09-10T12:59:40.000Z"), NOW, "UTC"),
    ).toBe("1 hour");
    // 23.6 hours out rounds to 24 hours, which should read as the date instead.
    expect(
      formatNextReviewLabel(new Date("2026-09-11T11:40:00.000Z"), NOW, "UTC"),
    ).toBe("Sep 11, 2026");
  });

  it("renders the date in the learner's timezone, not the runtime's", () => {
    // 2026-09-12T03:00Z is still Sep 11 in Los Angeles.
    expect(
      formatNextReviewLabel(
        new Date("2026-09-12T03:00:00.000Z"),
        NOW,
        "America/Los_Angeles",
      ),
    ).toBe("Sep 11, 2026");
  });
});
