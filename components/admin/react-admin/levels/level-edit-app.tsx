"use client";

import dynamic from "next/dynamic";

import { FormSkeleton } from "../skeletons";
import type { LevelFields } from "./level-edit-model";

/**
 * The client-only boundary for a level's metadata form — same shape and reasons
 * as `levels-list-app.tsx`: React Admin and Material UI load as a lazy chunk
 * with SSR off, so only the routes that use them download them. The server page
 * renders the heading and the specialist board; this is only the form.
 */
const LevelEditRoot = dynamic(() => import("./level-edit-root"), {
  ssr: false,
  loading: () => <FormSkeleton label="Loading the properties of this level…" />,
});

export function AdminLevelEditApp(props: {
  signInPath: string;
  levelId: string;
  levelNumber: number;
  fields: LevelFields;
  counts: {
    vocabularyItems: number;
    grammarItems: number;
    vocabularyGroups: number;
  };
}) {
  return <LevelEditRoot {...props} />;
}
