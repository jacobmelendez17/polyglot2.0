"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { GroupEditScreen } from "./group-edit-screen";
import type { GroupFields } from "./group-edit-model";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `group-edit-app.tsx` is a single lazy chunk. */
export default function GroupEditRoot({
  signInPath,
  groupId,
  fields,
}: {
  signInPath: string;
  groupId: string;
  fields: GroupFields;
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <GroupEditScreen groupId={groupId} fields={fields} />
    </ReactAdminProvider>
  );
}
