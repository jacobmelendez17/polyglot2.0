"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { UsersListScreen } from "./users-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `users-list-app.tsx` is a single lazy chunk. */
export default function UsersListRoot({
  signInPath,
  currentUserId,
}: {
  signInPath: string;
  currentUserId: string;
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <UsersListScreen currentUserId={currentUserId} />
    </ReactAdminProvider>
  );
}
