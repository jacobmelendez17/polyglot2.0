"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the account list — same shape and reasons as
 * `groups-list-app.tsx`: React Admin and Material UI load as a lazy chunk with
 * SSR off, so only the routes that use them download them.
 */
const UsersListRoot = dynamic(() => import("./users-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the users…" rows={5} />,
});

export function AdminUsersListApp(props: {
  signInPath: string;
  /** The signed-in Admin's own account id, so their own row offers no role change. */
  currentUserId: string;
}) {
  return <UsersListRoot {...props} />;
}
