import { describe, expect, it } from "vitest";

import { applyReviewQueueTiming } from "./review-queue-timing";

describe("applyReviewQueueTiming", () => {
  describe("start_of_hour", () => {
    it("rounds forward to the next hour boundary (spec 20's own example: 4:37 PM -> 5:00 PM)", () => {
      const result = applyReviewQueueTiming(new Date("2026-09-18T16:37:00Z"), "start_of_hour", "UTC");
      expect(result).toEqual(new Date("2026-09-18T17:00:00Z"));
    });

    it("leaves an already-on-the-hour timestamp unchanged (spec's own second example)", () => {
      const result = applyReviewQueueTiming(new Date("2026-09-18T16:00:00Z"), "start_of_hour", "UTC");
      expect(result).toEqual(new Date("2026-09-18T16:00:00Z"));
    });

    it("is timezone-invariant — only Start of Day needs one", () => {
      const utc = applyReviewQueueTiming(new Date("2026-09-18T16:37:00Z"), "start_of_hour", "UTC");
      const phoenix = applyReviewQueueTiming(new Date("2026-09-18T16:37:00Z"), "start_of_hour", "America/Phoenix");
      expect(phoenix).toEqual(utc);
    });
  });

  describe("start_of_day", () => {
    it("matches spec 20's own worked example: Sept 18 3:40 PM America/Phoenix -> Sept 18 12:00 AM Phoenix", () => {
      const result = applyReviewQueueTiming(new Date("2026-09-18T22:40:00Z"), "start_of_day", "America/Phoenix");
      expect(result).toEqual(new Date("2026-09-18T07:00:00Z"));
    });
  });
});
