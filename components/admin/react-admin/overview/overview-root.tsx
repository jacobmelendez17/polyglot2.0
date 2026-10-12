"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { OverviewScreen } from "./overview-screen";

/**
 * Everything React Admin/Material UI, in one module, so the dynamic import
 * in `overview-app.tsx` pulls the whole library into a single lazy chunk
 * that only `/admin` ever downloads.
 */
export default function OverviewRoot({ signInPath }: { signInPath: string }) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <OverviewScreen />
    </ReactAdminProvider>
  );
}
