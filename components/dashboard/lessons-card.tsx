import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardData } from "@/domains/dashboard";

type LessonsCardProps = {
  lessons: DashboardData["lessons"];
};

export function LessonsCard({ lessons }: LessonsCardProps) {
  const hasLessons = lessons.availableCount > 0;

  return (
    <Card className="border-primary/25 bg-primary/10">
      <CardHeader>
        <CardTitle>Lessons</CardTitle>
        <CardDescription>Learn something new today</CardDescription>
      </CardHeader>
      <CardContent>
        {hasLessons ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/lessons">Start lessons</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/lessons/customize">Customize</Link>
            </Button>
          </div>
        ) : (
          // A single row, matching the height of the button row above — the
          // shared `EmptyState` component's stacked icon/title/description
          // layout is much taller, and since this card shares a grid row
          // with `ReviewsCard`, a taller empty state here stretched both
          // cards to match it.
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <BookOpen
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-medium text-foreground">
              No lessons available right now
            </span>
            <span className="text-muted-foreground">
              New lessons unlock as you review and level up.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
