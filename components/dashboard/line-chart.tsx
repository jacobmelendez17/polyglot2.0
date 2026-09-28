"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ChartData, ChartOptions } from "chart.js";

import { Skeleton } from "@/components/ui/skeleton";
import type { ReviewHistoryPoint } from "@/domains/dashboard";

import "@/components/dashboard/charts/register-chart-js";
import { useDashboardChartColors } from "@/components/dashboard/charts/chart-colors";
import {
  buildChartAriaLabel,
  buildQuantityAxisOptions,
  buildTooltipOptions,
} from "@/components/dashboard/charts/chart-options";

// Chart.js/react-chartjs-2 must not sit in the initial dashboard bundle —
// only these two chart widgets need it (`code-standards.md`: "Dynamically
// import heavy client-only libraries").
const Line = dynamic(() => import("react-chartjs-2").then((mod) => mod.Line), {
  ssr: false,
  loading: () => <Skeleton className="h-24 w-full sm:h-32" />,
});

type LineChartProps = {
  points: ReviewHistoryPoint[];
};

export function LineChart({ points }: LineChartProps) {
  const colors = useDashboardChartColors();

  const ariaLabel = buildChartAriaLabel(
    "Completed reviews over time.",
    points,
    (point) => `${point.label}: ${point.completedCount} reviews`,
  );

  const data: ChartData<"line"> = useMemo(
    () => ({
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: "Reviews completed",
          data: points.map((point) => point.completedCount),
          borderColor: colors.primary,
          backgroundColor: colors.primary,
          pointBackgroundColor: colors.primary,
          pointBorderColor: colors.primary,
          pointRadius: 3,
          borderWidth: 2,
          tension: 0,
          fill: false,
        },
      ],
    }),
    [points, colors],
  );

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutQuart" },
      scales: {
        x: { display: false },
        y: { ...buildQuantityAxisOptions(colors), grace: "10%" },
      },
      plugins: {
        legend: { display: false },
        tooltip: buildTooltipOptions(colors),
      },
      font: { family: colors.fontFamily },
    }),
    [colors],
  );

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={ariaLabel} className="h-24 w-full sm:h-32">
        <div aria-hidden="true" className="h-full w-full">
          <Line data={data} options={options} />
        </div>
      </div>

      <div className="flex gap-1" aria-hidden="true">
        {points.map((point) => (
          <span
            key={point.timestamp}
            className="flex-1 text-center text-xs text-muted-foreground"
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
