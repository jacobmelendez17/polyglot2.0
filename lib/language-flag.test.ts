import { describe, expect, it } from "vitest";

import { regionFlagEmoji } from "./language-flag";

describe("regionFlagEmoji", () => {
  it("derives the region's flag from the code's region subtag", () => {
    expect(regionFlagEmoji("es-MX")).toBe("🇲🇽");
    expect(regionFlagEmoji("tl-PH")).toBe("🇵🇭");
    expect(regionFlagEmoji("fr-FR")).toBe("🇫🇷");
  });

  it("falls back to a plain flag when there is no region subtag to derive from", () => {
    expect(regionFlagEmoji("es")).toBe("🏳️");
    expect(regionFlagEmoji("")).toBe("🏳️");
  });
});
