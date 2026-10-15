"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { LogsListScreen } from "./logs-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `logs-list-app.tsx` is a single lazy chunk. */
export default function LogsListRoot({ signInPath }: { signInPath: string }) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <LogsListScreen />
    </ReactAdminProvider>
  );
}
