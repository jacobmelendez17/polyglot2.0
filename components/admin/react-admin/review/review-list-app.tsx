"use client";

import dynamic from "next/dynamic";

import { ReviewListSkeleton } from "./review-list-skeleton";

/**
 * The client-only boundary for the review queue — same shape and reasons as
 * `overview-app.tsx` and `curriculum-list-app.tsx`: React Admin and Material
 * UI load as a lazy chunk with SSR off, so only this route downloads them.
 */
const ReviewListRoot = dynamic(() => import("./review-list-root"), {
  ssr: false,
  loading: () => <ReviewListSkeleton />,
});

export function AdminReviewListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return <ReviewListRoot {...props} />;
}
