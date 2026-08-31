import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StreakDay } from "@/domains/dashboard";

type StreakRowProps = {
  streak: StreakDay[];
};

export function StreakRow({ streak }: StreakRowProps) {
  return (
    <ul className="flex items-center justify-between gap-1" aria-label="Weekly activity streak">
      {streak.map((day) => (
        <li key={day.date} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground",
              day.isActive ? "border-transparent bg-primary/15 text-primary" : "border-border",
              day.isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background"
            )}
          >
            {day.isActive ? <Flame className="h-4 w-4" aria-hidden="true" /> : null}
            <span className="sr-only">
              {day.label}: {day.isActive ? "active" : "inactive"}
              {day.isToday ? ", today" : ""}
            </span>
          </span>
          <span aria-hidden="true" className="text-[11px] text-muted-foreground">
            {day.label[0]}
          </span>
        </li>
      ))}
    </ul>
  );
}
