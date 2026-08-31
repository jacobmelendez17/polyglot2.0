"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RangeToggle } from "@/components/dashboard/range-toggle";
import { StackedBarChart } from "@/components/dashboard/stacked-bar-chart";
import type { DashboardData, ForecastRange } from "@/domains/dashboard";

const RANGE_OPTIONS = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
] as const satisfies readonly { value: ForecastRange; label: string }[];

type ItemForecastCardProps = {
  forecast: DashboardData["forecast"];
};

export function ItemForecastCard({ forecast }: ItemForecastCardProps) {
  const [range, setRange] = useState<ForecastRange>("24h");
  const buckets = forecast[range];
  const hasUpcomingItems = buckets.some((bucket) => bucket.vocabularyCount + bucket.grammarCount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Item Forecast</CardTitle>
        <CardAction>
          <RangeToggle
            label="Item forecast range"
            layoutId="item-forecast-range-pill"
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {hasUpcomingItems ? (
          <>
            <StackedBarChart buckets={buckets} />
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-learning-vocabulary" aria-hidden="true" />
                Vocabulary
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-learning-grammar" aria-hidden="true" />
                Grammar
              </span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No reviews forecasted"
            description="Nothing is scheduled to come due in this window yet."
          />
        )}
      </CardContent>
    </Card>
  );
}
