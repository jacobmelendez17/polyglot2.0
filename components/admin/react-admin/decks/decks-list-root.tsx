"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { DecksListScreen } from "./decks-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `decks-list-app.tsx` is a single lazy chunk. */
export default function DecksListRoot({
  signInPath,
  languages,
}: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <DecksListScreen languages={languages} />
    </ReactAdminProvider>
  );
}
