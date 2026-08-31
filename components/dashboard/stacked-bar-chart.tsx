"use client";

import { motion } from "motion/react";

import type { ForecastBucket } from "@/domains/dashboard";

const CHART_HEIGHT_PX = 128;
const BAR_SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

type StackedBarChartProps = {
  buckets: ForecastBucket[];
};

export function StackedBarChart({ buckets }: StackedBarChartProps) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.vocabularyCount + bucket.grammarCount));

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-end gap-2 sm:gap-3"
        style={{ height: CHART_HEIGHT_PX }}
        role="img"
        aria-label={`Upcoming review items by time. ${buckets
          .map((bucket) => `${bucket.label}: ${bucket.vocabularyCount + bucket.grammarCount} items`)
          .join(", ")}`}
      >
        {buckets.map((bucket, index) => {
          const vocabHeight = (bucket.vocabularyCount / maxCount) * CHART_HEIGHT_PX;
          const grammarHeight = (bucket.grammarCount / maxCount) * CHART_HEIGHT_PX;

          return (
            <div
              // Keyed by slot position, not timestamp/label, so switching ranges
              // (which changes both the bucket count and every label) reuses the
              // same DOM nodes and springs to the new heights instead of
              // unmounting and remounting at their final size.
              key={`bar-slot-${index}`}
              aria-hidden="true"
              className="flex flex-1 flex-col-reverse items-stretch gap-0.5"
              style={{ height: CHART_HEIGHT_PX }}
            >
              <motion.div
                className="min-h-0 rounded-t-sm bg-learning-vocabulary last:rounded-t-none"
                initial={false}
                animate={{ height: vocabHeight }}
                transition={BAR_SPRING}
              />
              <motion.div
                className="min-h-0 rounded-t-sm bg-learning-grammar"
                initial={false}
                animate={{ height: grammarHeight }}
                transition={BAR_SPRING}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 sm:gap-3" aria-hidden="true">
        {buckets.map((bucket) => (
          <span key={bucket.timestamp} className="flex-1 text-center text-xs text-muted-foreground">
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}
