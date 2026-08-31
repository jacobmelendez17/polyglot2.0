import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
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
          <EmptyState
            icon={BookOpen}
            title="No lessons available right now"
            description="New lessons unlock as you review and level up."
          />
        )}
      </CardContent>
    </Card>
  );
}
