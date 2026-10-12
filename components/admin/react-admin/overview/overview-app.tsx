"use client";

import dynamic from "next/dynamic";

import { OverviewSkeleton } from "./overview-skeleton";

/**
 * The client-only boundary for the Admin Overview (spec 26 §3). React Admin,
 * Material UI, and Emotion are heavy and browser-only, so they load as a lazy
 * chunk with SSR disabled (ui-context.md "Frontend Performance": heavy
 * client-only libraries must not sit in the initial bundle). Disabling SSR
 * also means Emotion needs no server style registry; the server renders only
 * the skeleton, which is also what shows while the chunk downloads.
 *
 * Kept in its own module so the server page imports a plain component and the
 * `ssr: false` option lives, as Next requires, in a Client Component.
 */
const OverviewRoot = dynamic(() => import("./overview-root"), {
  ssr: false,
  loading: () => <OverviewSkeleton />,
});

export function AdminOverviewApp({ signInPath }: { signInPath: string }) {
  return <OverviewRoot signInPath={signInPath} />;
}
