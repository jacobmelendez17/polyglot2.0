"use client";

import { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LineChart } from "@/components/dashboard/line-chart";
import { RangeToggle } from "@/components/dashboard/range-toggle";
import type { DashboardData, ReviewHistoryRange } from "@/domains/dashboard";

const RANGE_OPTIONS = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
] as const satisfies readonly { value: ReviewHistoryRange; label: string }[];

type ReviewHistoryCardProps = {
  reviewHistory: DashboardData["reviewHistory"];
};

export function ReviewHistoryCard({ reviewHistory }: ReviewHistoryCardProps) {
  const [range, setRange] = useState<ReviewHistoryRange>("7d");
  const points = reviewHistory[range];
  const hasHistory = points.some((point) => point.completedCount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review History</CardTitle>
        <CardAction>
          <RangeToggle
            label="Review history range"
            layoutId="review-history-range-pill"
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {hasHistory ? (
          <LineChart points={points} />
        ) : (
          <EmptyState
            icon={LineChartIcon}
            title="No review history yet"
            description="Completed reviews will show up here once you start reviewing."
          />
        )}
      </CardContent>
    </Card>
  );
}
