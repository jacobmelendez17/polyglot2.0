"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ChartData, ChartOptions } from "chart.js";

import { Skeleton } from "@/components/ui/skeleton";
import type { ForecastBucket } from "@/domains/dashboard";

import "@/components/dashboard/charts/register-chart-js";
import { createStripePattern } from "@/components/dashboard/charts/canvas-patterns";
import { useDashboardChartColors } from "@/components/dashboard/charts/chart-colors";
import {
  buildChartAriaLabel,
  buildTooltipOptions,
} from "@/components/dashboard/charts/chart-options";

const CHART_HEIGHT_PX = 128;

// Chart.js/react-chartjs-2 must not sit in the initial dashboard bundle —
// only these two chart widgets need it (`code-standards.md`: "Dynamically
// import heavy client-only libraries").
const Bar = dynamic(() => import("react-chartjs-2").then((mod) => mod.Bar), {
  ssr: false,
  loading: () => (
    <Skeleton style={{ height: CHART_HEIGHT_PX }} className="w-full" />
  ),
});

type StackedBarChartProps = {
  buckets: ForecastBucket[];
};

export function StackedBarChart({ buckets }: StackedBarChartProps) {
  const colors = useDashboardChartColors();

  const ariaLabel = buildChartAriaLabel(
    "Upcoming review items by time.",
    buckets,
    (bucket) =>
      `${bucket.label}: ${bucket.vocabularyCount + bucket.grammarCount} items`,
  );

  const data: ChartData<"bar"> = useMemo(
    () => ({
      labels: buckets.map((bucket) => bucket.label),
      datasets: [
        {
          label: "Vocabulary",
          data: buckets.map((bucket) => bucket.vocabularyCount),
          backgroundColor: colors.vocabulary,
          borderRadius: 0,
          borderSkipped: false,
        },
        {
          label: "Grammar",
          data: buckets.map((bucket) => bucket.grammarCount),
          backgroundColor: colors.colorBlindAssistance
            ? (context) => {
                const { ctx } = context.chart;
                return createStripePattern(ctx, colors.grammar);
              }
            : colors.grammar,
          borderRadius: {
            topLeft: 3,
            topRight: 3,
            bottomLeft: 0,
            bottomRight: 0,
          },
          borderSkipped: false,
        },
      ],
    }),
    [buckets, colors],
  );

  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutQuart" },
      scales: {
        x: { stacked: true, display: false },
        y: { stacked: true, display: false, beginAtZero: true },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...buildTooltipOptions(colors),
          mode: "index",
          intersect: false,
        },
      },
      font: { family: colors.fontFamily },
    }),
    [colors],
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={ariaLabel}
        style={{ height: CHART_HEIGHT_PX }}
      >
        <div aria-hidden="true" className="h-full w-full">
          <Bar data={data} options={options} />
        </div>
      </div>

      <div className="flex gap-2 sm:gap-3" aria-hidden="true">
        {buckets.map((bucket) => (
          <span
            key={bucket.timestamp}
            className="flex-1 text-center text-xs text-muted-foreground"
          >
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}
