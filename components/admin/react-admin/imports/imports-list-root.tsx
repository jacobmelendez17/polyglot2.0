"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { ImportsListScreen } from "./imports-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `imports-list-app.tsx` is a single lazy chunk. */
export default function ImportsListRoot({
  signInPath,
  languages,
  archived,
}: {
  signInPath: string;
  languages: { id: string; name: string }[];
  archived: boolean;
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <ImportsListScreen languages={languages} archived={archived} />
    </ReactAdminProvider>
  );
}
