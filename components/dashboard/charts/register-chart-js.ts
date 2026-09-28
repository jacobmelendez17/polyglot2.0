import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { TooltipPositionerFunction, VisualElement } from "chart.js";

/**
 * Registers only the Chart.js pieces the dashboard charts actually use.
 * Both `stacked-bar-chart.tsx` and `line-chart.tsx` import this module for
 * its side effect before rendering. No Legend (both charts render their own
 * plain-HTML legend/axis labels) and no Filler (the line chart draws a bare
 * line, not a filled area).
 */
Chart.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  PointElement,
  LineController,
  Tooltip,
);

declare module "chart.js" {
  interface TooltipPositionerMap {
    /** See `stackCenterPositioner` below. */
    stackCenter: TooltipPositionerFunction<"bar">;
  }
}

/**
 * A bar `Element`'s built-in `tooltipPosition()` returns its *value* point —
 * the top edge of the (sub-)bar — not its visual center, so the default
 * "average" positioner anchors the tooltip caret at the top of the tallest
 * segment (user-reported on `stacked-bar-chart.tsx`, whose tooltip mode
 * combines both stacked segments at one index). `getCenterPoint()` (declared
 * on `VisualElement`, which `BarElement` implements but the base `Element`
 * type on `ActiveElement.element` doesn't) instead splits the segment's own
 * height in half, so averaging that across the hovered index's segments
 * lands the caret inside the stack rather than above it.
 */
const stackCenterPositioner: TooltipPositionerFunction<"bar"> = (items) => {
  let xSum = 0;
  let ySum = 0;
  let count = 0;
  for (const item of items) {
    const { x, y } = (
      item.element as unknown as VisualElement
    ).getCenterPoint();
    if (x === null || y === null) continue;
    xSum += x;
    ySum += y;
    count += 1;
  }
  if (count === 0) return false;
  return { x: xSum / count, y: ySum / count };
};

Tooltip.positioners.stackCenter = stackCenterPositioner;
