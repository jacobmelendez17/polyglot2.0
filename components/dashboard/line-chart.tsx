"use client";

import { motion } from "motion/react";

import type { ReviewHistoryPoint } from "@/domains/dashboard";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 96;
const PADDING_Y = 8;
/** Fixed slot count = the largest range (30 days). Keeping this constant
 * across ranges lets every dot and the connecting polyline keep the same
 * React key and SVG-attribute shape, so Motion can spring between old and
 * new positions instead of remounting at the final layout. */
const SLOT_COUNT = 10;
const POINT_SPRING = { type: "spring", bounce: 0.15, duration: 0.5 } as const;

function toY(value: number, max: number): number {
  const usable = CHART_HEIGHT - PADDING_Y * 2;
  return PADDING_Y + usable - (value / max) * usable;
}

/** Real data points laid out across the full chart width, then padded to
 * `SLOT_COUNT` by repeating the last point so the extra slots collapse to a
 * zero-length, invisible line segment rather than an empty flat extension. */
function toSlots(values: number[], max: number): { x: number; y: number }[] {
  if (values.length === 0) {
    return Array.from({ length: SLOT_COUNT }, () => ({ x: CHART_WIDTH / 2, y: toY(0, max) }));
  }

  const real = values.map((value, index) => ({
    x: values.length === 1 ? CHART_WIDTH / 2 : (index / (values.length - 1)) * CHART_WIDTH,
    y: toY(value, max),
  }));

  const last = real[real.length - 1];
  return Array.from({ length: SLOT_COUNT }, (_, index) => real[index] ?? last);
}

type LineChartProps = {
  points: ReviewHistoryPoint[];
};

export function LineChart({ points }: LineChartProps) {
  const values = points.map((point) => point.completedCount);
  const maxValue = Math.max(1, ...values);
  const slots = toSlots(values, maxValue);
  const polylinePoints = slots.map((slot) => `${slot.x},${slot.y}`).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-24 w-full sm:h-32"
        role="img"
        aria-label={`Completed reviews over time. ${points
          .map((point) => `${point.label}: ${point.completedCount} reviews`)
          .join(", ")}`}
      >
        <motion.polyline
          aria-hidden="true"
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary"
          initial={false}
          animate={{ points: polylinePoints }}
          transition={POINT_SPRING}
        />
        {slots.map((slot, index) => (
          <motion.circle
            key={`point-slot-${index}`}
            aria-hidden="true"
            r={3}
            className="fill-primary"
            initial={false}
            animate={{ cx: slot.x, cy: slot.y }}
            transition={POINT_SPRING}
          />
        ))}
      </svg>

      <div className="flex gap-1" aria-hidden="true">
        {points.map((point) => (
          <span key={point.timestamp} className="flex-1 text-center text-xs text-muted-foreground">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
