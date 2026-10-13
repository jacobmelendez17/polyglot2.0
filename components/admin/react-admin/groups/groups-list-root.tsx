"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { GroupsListScreen } from "./groups-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `groups-list-app.tsx` is a single lazy chunk. */
export default function GroupsListRoot({
  signInPath,
  languages,
  levels,
}: {
  signInPath: string;
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <GroupsListScreen languages={languages} levels={levels} />
    </ReactAdminProvider>
  );
}
