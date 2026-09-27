import { describe, expect, it } from "vitest";

import {
  STAGE_COUNT,
  TOWER,
  plateThickness,
  srsPalette,
  stageName,
  towerGeometry,
  type RGB,
} from "./tower";

describe("towerGeometry", () => {
  const plates = towerGeometry();

  it("has one plate per SRS stage, Beginner 1 at the bottom and Fluent on top", () => {
    expect(plates).toHaveLength(STAGE_COUNT);
    expect(stageName(0)).toBe("Beginner 1");
    expect(stageName(STAGE_COUNT - 1)).toBe("Fluent");
  });

  it("uses the app's own stage names, including Master (never a second list)", () => {
    expect(STAGE_COUNT).toBe(9);
    expect(stageName(7)).toBe("Master");
  });

  it("rests the bottom plate exactly on the ground line", () => {
    const p = plates[0]!;
    expect(p.cy + TOWER.halfH + p.thickness).toBe(TOWER.ground);
  });

  it("stacks each plate directly on the one below (no gaps, no overlap)", () => {
    for (let k = 1; k < plates.length; k++) {
      // a plate's lowest edge sits on the previous plate's top face
      expect(plates[k]!.cy + plates[k]!.thickness).toBeCloseTo(
        plates[k - 1]!.cy,
      );
    }
  });

  it("thickens plates as the review interval grows", () => {
    for (let k = 1; k < STAGE_COUNT; k++)
      expect(plateThickness(k)).toBeGreaterThan(plateThickness(k - 1));
  });

  it("centres the tower in the viewBox so it lines up with the text column", () => {
    expect(TOWER.cx).toBe(TOWER.width / 2);
    const xs = plates[0]!.top.split(" ").map((pt) => Number(pt.split(",")[0]));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBe(TOWER.cx);
  });

  it("keeps the whole tower inside the viewBox", () => {
    const top = plates[STAGE_COUNT - 1]!;
    expect(top.cy - TOWER.halfH).toBeGreaterThanOrEqual(0);
  });

  it("spaces labels far enough apart to stay legible", () => {
    for (let k = 1; k < plates.length; k++) {
      expect(
        plates[k - 1]!.label.y - plates[k]!.label.y,
      ).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("srsPalette", () => {
  const card: RGB = [255, 255, 255];
  const accent: RGB = [127, 166, 155];
  const ink: RGB = [62, 68, 64];
  const pal = srsPalette(card, accent, ink);
  const lightness = ([r, g, b]: RGB) => r + g + b;

  it("returns nine colours", () => expect(pal).toHaveLength(9));

  it("hits the accent exactly at Familiar 2", () =>
    expect(pal[5]).toEqual(accent));

  it("deepens monotonically from Beginner 1 to Fluent on a light theme", () => {
    for (let k = 1; k < pal.length; k++)
      expect(lightness(pal[k]!)).toBeLessThan(lightness(pal[k - 1]!));
  });
});
