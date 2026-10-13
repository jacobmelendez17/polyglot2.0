"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the groups list — same shape and reasons as
 * `levels-list-app.tsx`: React Admin and Material UI load as a lazy chunk with
 * SSR off, so only the routes that use them download them.
 */
const GroupsListRoot = dynamic(() => import("./groups-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the groups…" rows={4} />,
});

export function AdminGroupsListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
  /** The levels of the language the page is showing, in level order. */
  levels: { id: string; levelNumber: number }[];
}) {
  return <GroupsListRoot {...props} />;
}
