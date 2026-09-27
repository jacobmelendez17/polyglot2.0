/**
 * Spec 20 Appearance — Color-Blind Assistance. `stacked-bar-chart.tsx`'s
 * Vocabulary/Grammar segments are two adjacent color fills with no
 * per-segment label, so the toggle needs a genuine non-color cue. The old
 * hand-built SVG bars used a CSS border-style difference (solid vs. dashed),
 * which only works on real DOM elements; Chart.js paints to `<canvas>`, so
 * the equivalent here is a diagonal-stripe fill pattern on the Grammar
 * segment instead of its plain solid color.
 */
export function createStripePattern(
  ctx: CanvasRenderingContext2D,
  color: string,
): CanvasPattern | string {
  const size = 8;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = size;
  patternCanvas.height = size;
  const patternCtx = patternCanvas.getContext("2d");
  if (!patternCtx) return color;

  patternCtx.fillStyle = color;
  patternCtx.fillRect(0, 0, size, size);
  patternCtx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  patternCtx.lineWidth = 2;
  patternCtx.beginPath();
  patternCtx.moveTo(0, size);
  patternCtx.lineTo(size, 0);
  patternCtx.stroke();

  return ctx.createPattern(patternCanvas, "repeat") ?? color;
}
