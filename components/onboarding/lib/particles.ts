// Particle field (onboarding slide 3). Pure simulation so it can be tested
// deterministically — the component owns only the canvas and the rAF loop.
//
// Each particle has a home position. Every frame it drifts gently around home,
// is pushed away from the pointer inside a radius, and springs back when the
// pointer leaves.

export type Particle = {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  alpha: number;
  /** size multiplier: one of three buckets so canvas font changes stay rare */
  scale: number;
  glyph: string;
};

export type Pointer = { x: number; y: number };

/** Letters from many writing systems for the "letters from everywhere" toggle. */
export const PARTICLE_GLYPHS = [
  "ñ",
  "á",
  "é",
  "ç",
  "ß",
  "ø",
  "å",
  "ü",
  "ł",
  "ž",
  "ğ",
  "ă",
  "œ",
  "¿",
  "¡",
  "あ",
  "カ",
  "한",
  "글",
  "Ж",
  "Д",
  "Ω",
  "λ",
  "中",
  "文",
  "अ",
  "क",
  "ก",
  "ข",
  "א",
  "ב",
  "ع",
  "ش",
];

export const PARTICLE_COLORS = [
  { id: "sage", name: "Sage", token: "accent", deepen: 0 },
  { id: "clay", name: "Clay", token: "danger", deepen: 0 },
  // gold is pale on the page background, so nudge it toward ink for visibility
  { id: "marigold", name: "Marigold", token: "gold", deepen: 0.18 },
  { id: "ink", name: "Ink", token: "ink", deepen: 0 },
] as const;
export type ParticleColorId = (typeof PARTICLE_COLORS)[number]["id"];

export const SIZE_MIN = 1;
export const SIZE_MAX = 6;
export const SIZE_DEFAULT = 2.5;

/** Small deterministic PRNG (mulberry32) so tests and layouts are repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCALES = [0.75, 1, 1.3] as const;

export function buildParticles(
  width: number,
  height: number,
  {
    scatter = false,
    random = Math.random,
  }: { scatter?: boolean; random?: () => number } = {},
): Particle[] {
  const spacing = width < 600 ? 22 : 19;
  const out: Particle[] = [];
  for (let y = spacing * 0.7; y < height - spacing * 0.3; y += spacing) {
    for (let x = spacing * 0.5; x < width; x += spacing) {
      const hx = x + (random() - 0.5) * 9;
      const hy = y + (random() - 0.5) * 9;
      out.push({
        hx,
        hy,
        // scattered particles start in a clump below the field and assemble
        x: scatter ? width / 2 + (random() - 0.5) * 60 : hx,
        y: scatter ? height + 20 + random() * 80 : hy,
        vx: 0,
        vy: 0,
        phase: random() * Math.PI * 2,
        alpha: 0.35 + random() * 0.65,
        scale: SCALES[Math.floor(random() * SCALES.length)]!,
        glyph: PARTICLE_GLYPHS[Math.floor(random() * PARTICLE_GLYPHS.length)]!,
      });
    }
  }
  // grouped by scale so the renderer changes canvas font at most three times per frame
  return out.sort((a, b) => a.scale - b.scale);
}

export const repelRadius = (size: number): number => 100 + size * 6;

export function stepParticles(
  parts: Particle[],
  timeMs: number,
  pointer: Pointer | null,
  size: number,
): void {
  const r = repelRadius(size);
  const r2 = r * r;
  for (const p of parts) {
    const tx = p.hx + Math.sin(timeMs * 0.0011 + p.phase) * 3.2;
    const ty = p.hy + Math.cos(timeMs * 0.0009 + p.phase * 1.3) * 3.2;
    p.vx += (tx - p.x) * 0.028;
    p.vy += (ty - p.y) * 0.028;
    if (pointer) {
      const dx = p.x - pointer.x;
      const dy = p.y - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const f = 1 - d / r;
        const push = f * f * 5.2;
        p.vx += (dx / d) * push;
        p.vy += (dy / d) * push;
      }
    }
    p.vx *= 0.84;
    p.vy *= 0.84;
    p.x += p.vx;
    p.y += p.vy;
  }
}

/** A random kick, used when the look changes so the swap feels physical. */
export function scatterKick(
  parts: Particle[],
  random = Math.random,
  upward = false,
): void {
  for (const p of parts) {
    if (upward) {
      p.vy -= 2 + random() * 3;
      continue;
    }
    const a = random() * Math.PI * 2;
    const v = 2 + random() * 4;
    p.vx += Math.cos(a) * v;
    p.vy += Math.sin(a) * v;
  }
}

/** Soft fade at the top and bottom edges of the field. */
export function edgeFade(y: number, height: number): number {
  return Math.max(0, Math.min(1, y / 40, (height - y) / 60));
}
