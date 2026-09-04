import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/domains/dashboard";
import { formatRelativeTime } from "@/lib/time/format-relative-time";

type ReviewsCardProps = {
  reviews: DashboardData["reviews"];
};

/**
 * Whenever nothing is due — whether because everything is already reviewed
 * or because the learner has never had any reviews yet — this renders one
 * consistent, non-clickable "No reviews due yet" state rather than two
 * different card shapes (one of which used to offer a "Start lessons"
 * link). There is nothing to click through to until something is actually due.
 */
export function ReviewsCard({ reviews }: ReviewsCardProps) {
  const hasReviews = reviews.availableCount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reviews</CardTitle>
        <CardDescription>
          {hasReviews ? `${reviews.availableCount} ready for review` : "No reviews due yet"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasReviews ? (
          <Button asChild>
            <Link href="/reviews">Start reviews</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {reviews.nextReviewAt
              ? `Next review ${formatRelativeTime(new Date(reviews.nextReviewAt), new Date())}`
              : "Complete a lesson to start your first reviews."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
