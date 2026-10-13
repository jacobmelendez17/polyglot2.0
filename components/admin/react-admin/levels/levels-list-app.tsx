"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the levels list — same shape and reasons as
 * `review-list-app.tsx`: React Admin and Material UI load as a lazy chunk with
 * SSR off, so only the routes that use them download them.
 */
const LevelsListRoot = dynamic(() => import("./levels-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the levels…" rows={4} />,
});

export function AdminLevelsListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return <LevelsListRoot {...props} />;
}
