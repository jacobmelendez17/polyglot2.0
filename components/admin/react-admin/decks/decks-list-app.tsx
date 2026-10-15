"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the official-decks list — same shape and
 * reasons as `levels-list-app.tsx`: React Admin and Material UI load as a lazy
 * chunk with SSR off, so only the routes that use them download them.
 */
const DecksListRoot = dynamic(() => import("./decks-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the decks…" rows={4} />,
});

export function AdminDecksListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return <DecksListRoot {...props} />;
}
