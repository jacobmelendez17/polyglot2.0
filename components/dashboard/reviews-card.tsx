import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { DashboardData } from "@/domains/dashboard";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

type ReviewsCardProps = {
  reviews: DashboardData["reviews"];
};

export function ReviewsCard({ reviews }: ReviewsCardProps) {
  const hasReviews = reviews.availableCount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews</CardTitle>
        <CardDescription>
          {hasReviews ? `${reviews.availableCount} ready for review` : "You're all caught up"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasReviews ? (
          <Button asChild>
            <Link href="/reviews">Start reviews</Link>
          </Button>
        ) : reviews.nextReviewAt ? (
          <p className="text-sm text-muted-foreground">
            Next review {formatRelativeTime(new Date(reviews.nextReviewAt), new Date())}
          </p>
        ) : (
          <EmptyState
            icon={RotateCcw}
            title="No reviews yet"
            description="Complete a lesson to start your first reviews."
            action={{ label: "Start lessons", href: "/lessons" }}
          />
        )}
      </CardContent>
    </Card>
  );
}
