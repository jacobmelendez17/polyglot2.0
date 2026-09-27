import { describe, expect, it } from "vitest";

import {
  PARTICLE_COLORS,
  PARTICLE_GLYPHS,
  buildParticles,
  edgeFade,
  repelRadius,
  scatterKick,
  seededRandom,
  stepParticles,
} from "./particles";

const settle = (
  parts: ReturnType<typeof buildParticles>,
  pointer: { x: number; y: number } | null,
  frames = 240,
) => {
  for (let f = 0; f < frames; f++) stepParticles(parts, f * 16, pointer, 2.5);
};

describe("buildParticles", () => {
  it("is deterministic for a given seed", () => {
    const a = buildParticles(400, 200, { random: seededRandom(42) });
    const b = buildParticles(400, 200, { random: seededRandom(42) });
    expect(a).toEqual(b);
  });

  it("fills the field with particles near their home positions", () => {
    const parts = buildParticles(400, 200, { random: seededRandom(1) });
    expect(parts.length).toBeGreaterThan(100);
    for (const p of parts) {
      expect(p.x).toBe(p.hx);
      expect(p.hx).toBeGreaterThan(-10);
      expect(p.hx).toBeLessThan(410);
    }
  });

  it("starts scattered particles below the field so they can assemble", () => {
    const parts = buildParticles(400, 200, {
      scatter: true,
      random: seededRandom(1),
    });
    expect(parts.every((p) => p.y > 200)).toBe(true);
  });

  it("only uses glyphs from the multilingual set", () => {
    const parts = buildParticles(400, 200, { random: seededRandom(7) });
    expect(parts.every((p) => PARTICLE_GLYPHS.includes(p.glyph))).toBe(true);
  });

  it("groups particles by scale so the renderer changes font rarely", () => {
    const scales = buildParticles(400, 200, { random: seededRandom(3) }).map(
      (p) => p.scale,
    );
    expect(scales).toEqual([...scales].sort((x, y) => x - y));
  });
});

describe("stepParticles", () => {
  it("assembles scattered particles back to (near) home", () => {
    const parts = buildParticles(300, 150, {
      scatter: true,
      random: seededRandom(5),
    });
    settle(parts, null, 400);
    for (const p of parts)
      expect(Math.hypot(p.x - p.hx, p.y - p.hy)).toBeLessThan(6);
  });

  it("pushes particles near the pointer away from it", () => {
    const parts = buildParticles(300, 150, { random: seededRandom(9) });
    const pointer = { x: 150, y: 75 };
    const near = parts.filter(
      (p) => Math.hypot(p.hx - pointer.x, p.hy - pointer.y) < 30,
    );
    const before = near.map((p) =>
      Math.hypot(p.x - pointer.x, p.y - pointer.y),
    );
    settle(parts, pointer, 60);
    near.forEach((p, i) =>
      expect(Math.hypot(p.x - pointer.x, p.y - pointer.y)).toBeGreaterThan(
        before[i]!,
      ),
    );
  });

  it("leaves particles outside the repel radius essentially undisturbed", () => {
    const parts = buildParticles(600, 150, { random: seededRandom(11) });
    const pointer = { x: 20, y: 75 };
    const far = parts.filter(
      (p) =>
        Math.hypot(p.hx - pointer.x, p.hy - pointer.y) > repelRadius(2.5) + 40,
    );
    settle(parts, pointer, 120);
    for (const p of far)
      expect(Math.hypot(p.x - p.hx, p.y - p.hy)).toBeLessThan(6);
  });

  it("springs particles back once the pointer leaves", () => {
    const parts = buildParticles(300, 150, { random: seededRandom(13) });
    settle(parts, { x: 150, y: 75 }, 60);
    settle(parts, null, 400);
    for (const p of parts)
      expect(Math.hypot(p.x - p.hx, p.y - p.hy)).toBeLessThan(6);
  });
});

describe("helpers", () => {
  it("fades particles out at the top and bottom edges", () => {
    expect(edgeFade(0, 200)).toBe(0);
    expect(edgeFade(100, 200)).toBe(1);
    expect(edgeFade(200, 200)).toBe(0);
  });

  it("scatterKick gives every particle some velocity", () => {
    const parts = buildParticles(200, 100, { random: seededRandom(2) });
    scatterKick(parts, seededRandom(3));
    expect(parts.every((p) => p.vx !== 0 || p.vy !== 0)).toBe(true);
  });

  it("offers exactly four palette colours", () => {
    expect(PARTICLE_COLORS.map((c) => c.name)).toEqual([
      "Sage",
      "Clay",
      "Marigold",
      "Ink",
    ]);
  });
});
