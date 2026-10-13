"use client";

import dynamic from "next/dynamic";

import type { CurriculumFilterLookups } from "./curriculum-filters";
import { CurriculumListSkeleton } from "./curriculum-list-skeleton";

/**
 * The client-only boundary for the curriculum list — the same shape, and the
 * same reasons, as `overview-app.tsx`: React Admin and Material UI load as a
 * lazy chunk with SSR off, so only this route downloads them and Emotion
 * needs no server style registry. The server renders the skeleton, which is
 * also what shows while the chunk downloads.
 */
const CurriculumListRoot = dynamic(() => import("./curriculum-list-root"), {
  ssr: false,
  loading: () => <CurriculumListSkeleton />,
});

export function AdminCurriculumListApp(
  props: CurriculumFilterLookups & { signInPath: string },
) {
  return <CurriculumListRoot {...props} />;
}
