"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { LevelsListScreen } from "./levels-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `levels-list-app.tsx` is a single lazy chunk. */
export default function LevelsListRoot({
  signInPath,
  languages,
}: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <LevelsListScreen languages={languages} />
    </ReactAdminProvider>
  );
}
