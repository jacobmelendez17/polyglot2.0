import { describe, expect, it } from "vitest";

import { getSupportedTimezones, isSupportedTimezone } from "./timezones";

describe("timezones", () => {
  it("includes real, commonly used IANA identifiers", () => {
    const zones = getSupportedTimezones();
    expect(zones).toContain("America/Phoenix");
    expect(zones).toContain("America/Mexico_City");
    expect(zones).toContain("UTC");
  });

  it("isSupportedTimezone accepts a real identifier", () => {
    expect(isSupportedTimezone("America/Phoenix")).toBe(true);
  });

  it("isSupportedTimezone rejects a made-up value", () => {
    expect(isSupportedTimezone("Not/A_Timezone")).toBe(false);
    expect(isSupportedTimezone("")).toBe(false);
  });
});
