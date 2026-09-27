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
