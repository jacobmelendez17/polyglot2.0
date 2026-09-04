import { Suspense } from "react";
import type { Metadata } from "next";

import { ReviewEmptyState } from "@/components/reviews/review-empty-state";
import { ReviewLoadingSkeleton } from "@/components/reviews/review-loading-skeleton";
import { ReviewSessionView } from "@/components/reviews/review-session-view";
import { requireUser } from "@/domains/users/server";
import { startReviewSession } from "@/domains/srs/server";

export const metadata: Metadata = {
  title: "Reviews — Polyglot",
};

export default function ReviewsPage() {
  return (
    <Suspense fallback={<ReviewLoadingSkeleton />}>
      <ReviewPageContent />
    </Suspense>
  );
}

async function ReviewPageContent() {
  // proxy.ts protects /reviews, and requireUser() throws (rather than
  // returning null) when unauthenticated, so an unauthenticated request
  // never reaches this far in practice.
  const user = await requireUser();
  const result = await startReviewSession({ userId: user.id, languageId: user.activeLanguageId });

  if (result.kind === "empty") {
    return <ReviewEmptyState nextReviewAt={result.nextReviewAt} />;
  }

  return <ReviewSessionView initial={result} />;
}
