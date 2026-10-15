"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the audit log — same shape and reasons as
 * `review-list-app.tsx`: React Admin and Material UI load as a lazy chunk with
 * SSR off, so only the route that uses them downloads them.
 */
const LogsListRoot = dynamic(() => import("./logs-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the audit log…" rows={6} />,
});

export function AdminLogsListApp(props: { signInPath: string }) {
  return <LogsListRoot {...props} />;
}
