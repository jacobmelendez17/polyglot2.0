"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { CurriculumListScreen } from "./curriculum-list-screen";
import type { CurriculumFilterLookups } from "./curriculum-filters";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `curriculum-list-app.tsx` is a single lazy chunk. */
export default function CurriculumListRoot({
  signInPath,
  ...lookups
}: CurriculumFilterLookups & { signInPath: string }) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <CurriculumListScreen {...lookups} />
    </ReactAdminProvider>
  );
}
