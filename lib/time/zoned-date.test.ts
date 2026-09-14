import { describe, expect, it } from "vitest";

import { startOfDayInTimeZone } from "./zoned-date";

describe("startOfDayInTimeZone", () => {
  it("matches spec 20's own worked example: Sept 18 3:40 PM America/Phoenix -> Sept 18 12:00 AM Phoenix", () => {
    // 2026-09-18T22:40:00Z is 2026-09-18 15:40 in America/Phoenix (UTC-7, no DST).
    const result = startOfDayInTimeZone(new Date("2026-09-18T22:40:00Z"), "America/Phoenix");
    expect(result).toEqual(new Date("2026-09-18T07:00:00Z"));
  });

  it("aligns to the DST-observing zone's own midnight, not a fixed UTC offset", () => {
    // 2026-09-18T22:40:00Z is 2026-09-18 18:40 in America/New_York (UTC-4, EDT in September).
    const result = startOfDayInTimeZone(new Date("2026-09-18T22:40:00Z"), "America/New_York");
    expect(result).toEqual(new Date("2026-09-18T04:00:00Z"));
  });

  it("crosses a UTC calendar-date boundary for a zone ahead of UTC (fractional offset)", () => {
    // 2026-01-15T20:00:00Z is already 2026-01-16 01:30 in Asia/Kolkata (UTC+5:30) — the next UTC calendar day.
    const result = startOfDayInTimeZone(new Date("2026-01-15T20:00:00Z"), "Asia/Kolkata");
    expect(result).toEqual(new Date("2026-01-15T18:30:00Z"));
  });

  it("does not move a timestamp that is already exactly local midnight", () => {
    const result = startOfDayInTimeZone(new Date("2026-09-18T07:00:00Z"), "America/Phoenix");
    expect(result).toEqual(new Date("2026-09-18T07:00:00Z"));
  });
});
