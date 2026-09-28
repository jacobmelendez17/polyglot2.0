import type { TooltipOptions } from "chart.js";

import type { DashboardChartColors } from "./chart-colors";

/**
 * Shared tooltip styling for the dashboard charts, kept separate from each
 * chart's own data mapping so the two aren't duplicated across
 * `stacked-bar-chart.tsx` and `line-chart.tsx`. The old hand-built SVG
 * charts had no tooltip at all (the bars/line were purely decorative,
 * `aria-hidden`); this is a genuine improvement, not just a port.
 */
export function buildTooltipOptions(
  colors: DashboardChartColors,
): Partial<TooltipOptions<"bar" | "line">> {
  return {
    enabled: true,
    backgroundColor: colors.surface,
    titleColor: colors.mutedText,
    bodyColor: colors.primary,
    borderColor: colors.border,
    borderWidth: 1,
    cornerRadius: 8,
    padding: 8,
    displayColors: false,
    titleFont: { family: colors.fontFamily, size: 11, weight: "normal" },
    bodyFont: { family: colors.fontFamily, size: 12, weight: "bold" },
  };
}

/**
 * Shared y-axis styling for the two review-count charts (`stacked-bar-chart`,
 * `line-chart`), both counting a whole number of reviews. Kept muted per
 * `ui-context.md` ("Avoid dense axes and heavy chart chrome. Prefer muted
 * grid/label treatment.") — few ticks, no axis border, hairline grid.
 */
export function buildQuantityAxisOptions(colors: DashboardChartColors) {
  return {
    display: true,
    beginAtZero: true,
    border: { display: false },
    grid: { color: colors.gridLine },
    ticks: {
      color: colors.mutedText,
      font: { family: colors.fontFamily, size: 10 },
      precision: 0,
      maxTicksLimit: 4,
    },
  };
}

/** Builds the accessible summary read in place of the chart, which is
 * otherwise purely decorative (`aria-hidden`) canvas content. */
export function buildChartAriaLabel<T>(
  summary: string,
  items: readonly T[],
  describe: (item: T) => string,
): string {
  return `${summary} ${items.map(describe).join(", ")}`;
}
