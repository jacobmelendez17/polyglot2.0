"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the review queue — same shape and reasons as
 * `overview-app.tsx` and `curriculum-list-app.tsx`: React Admin and Material
 * UI load as a lazy chunk with SSR off, so only this route downloads them.
 */
const ReviewListRoot = dynamic(() => import("./review-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the review queue…" rows={6} />,
});

export function AdminReviewListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return <ReviewListRoot {...props} />;
}
