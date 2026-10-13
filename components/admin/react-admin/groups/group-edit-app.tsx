"use client";

import dynamic from "next/dynamic";

import { FormSkeleton } from "../skeletons";
import type { GroupFields } from "./group-edit-model";

/**
 * The client-only boundary for a group's metadata form — same shape and reasons
 * as `groups-list-app.tsx`: React Admin and Material UI load as a lazy chunk
 * with SSR off, so only the routes that use them download them. The server page
 * renders the heading; this is only the form.
 */
const GroupEditRoot = dynamic(() => import("./group-edit-root"), {
  ssr: false,
  loading: () => (
    <FormSkeleton label="Loading the properties of this group…" fields={2} />
  ),
});

export function AdminGroupEditApp(props: {
  signInPath: string;
  groupId: string;
  fields: GroupFields;
}) {
  return <GroupEditRoot {...props} />;
}
