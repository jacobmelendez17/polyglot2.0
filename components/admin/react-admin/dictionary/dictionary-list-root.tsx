"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { DictionaryListScreen } from "./dictionary-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `dictionary-list-app.tsx` is a single lazy chunk. */
export default function DictionaryListRoot({
  signInPath,
  languages,
  levels,
  groups,
  regionCodes,
}: {
  signInPath: string;
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  regionCodes: string[];
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <DictionaryListScreen
        languages={languages}
        levels={levels}
        groups={groups}
        regionCodes={regionCodes}
      />
    </ReactAdminProvider>
  );
}
