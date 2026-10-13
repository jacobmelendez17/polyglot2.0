"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { LevelEditScreen } from "./level-edit-screen";
import type { LevelFields } from "./level-edit-model";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `level-edit-app.tsx` is a single lazy chunk. */
export default function LevelEditRoot({
  signInPath,
  levelId,
  levelNumber,
  fields,
  counts,
}: {
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
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <LevelEditScreen
        levelId={levelId}
        levelNumber={levelNumber}
        fields={fields}
        counts={counts}
      />
    </ReactAdminProvider>
  );
}
