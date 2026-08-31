import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/time/format-relative-time";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("formats a time under an hour away in minutes", () => {
    expect(formatRelativeTime(new Date("2026-08-30T12:30:00.000Z"), NOW)).toBe("in 30 minutes");
  });

  it("formats a time under a day away in hours", () => {
    expect(formatRelativeTime(new Date("2026-08-30T15:00:00.000Z"), NOW)).toBe("in 3 hours");
  });

  it("formats a time a day or more away in days", () => {
    expect(formatRelativeTime(new Date("2026-09-02T12:00:00.000Z"), NOW)).toBe("in 3 days");
  });
});
