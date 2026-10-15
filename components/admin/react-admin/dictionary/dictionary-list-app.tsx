"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the dictionary mapping queue — same shape and
 * reasons as `review-list-app.tsx`: React Admin and Material UI load as a lazy
 * chunk with SSR off, so only the routes that use them download them.
 */
const DictionaryListRoot = dynamic(() => import("./dictionary-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the mapping queue…" rows={6} />,
});

export function AdminDictionaryListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
  /** The selected language's levels and groups — the filters' choices. */
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  /** The regions the selected language's dictionary covers. */
  regionCodes: string[];
}) {
  return <DictionaryListRoot {...props} />;
}
