"use client";

import { useState } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RangeToggle } from "@/components/dashboard/range-toggle";
import type { DashboardData, StageGroup } from "@/domains/dashboard";

const TYPE_OPTIONS = [
  { value: "vocabulary", label: "Vocabulary" },
  { value: "grammar", label: "Grammar" },
] as const satisfies readonly {
  value: "vocabulary" | "grammar";
  label: string;
}[];

/** Same 5 tokens `components/marketing/srs-section.tsx` uses for the identical stage groups — kept as inline styles for the same reason that file gives: the per-card color must win over the shared `border-border` class regardless of Tailwind's utility ordering. */
const STAGE_COLOR_VAR: Record<StageGroup, string> = {
  beginner: "var(--srs-beginner)",
  familiar: "var(--srs-familiar)",
  intermediate: "var(--srs-intermediate)",
  master: "var(--srs-master)",
  fluent: "var(--srs-fluent)",
};

type ProgressCardProps = {
  stageProgress: DashboardData["stageProgress"];
};

export function ProgressCard({ stageProgress }: ProgressCardProps) {
  const [itemType, setItemType] = useState<"vocabulary" | "grammar">(
    "vocabulary",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress</CardTitle>
        <CardAction>
          <RangeToggle
            label="Progress item type"
            layoutId="progress-item-type-pill"
            value={itemType}
            onChange={setItemType}
            options={TYPE_OPTIONS}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stageProgress.map((bucket) => {
            const count =
              itemType === "vocabulary"
                ? bucket.vocabularyCount
                : bucket.grammarCount;
            const color = STAGE_COLOR_VAR[bucket.stage];
            return (
              <div
                key={bucket.stage}
                className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center"
                style={{
                  borderColor: color,
                  backgroundColor: `color-mix(in oklch, ${color} 18%, var(--card))`,
                }}
              >
                <span className="text-2xl font-semibold text-foreground">
                  {count}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {bucket.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
