"use client";

import dynamic from "next/dynamic";

import { ListSkeleton } from "../skeletons";

/**
 * The client-only boundary for the import history — same shape and reasons as
 * `review-list-app.tsx`: React Admin and Material UI load as a lazy chunk with
 * SSR off, so only the routes that use them download them.
 */
const ImportsListRoot = dynamic(() => import("./imports-list-root"), {
  ssr: false,
  loading: () => <ListSkeleton label="Loading the import history…" rows={6} />,
});

export function AdminImportsListApp(props: {
  signInPath: string;
  languages: { id: string; name: string }[];
  /** `false` for `/imports`, `true` for `/imports/archived` — the route decides, never the address. */
  archived: boolean;
}) {
  return <ImportsListRoot {...props} />;
}
