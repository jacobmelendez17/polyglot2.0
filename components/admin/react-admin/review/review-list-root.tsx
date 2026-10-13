"use client";

import { ReactAdminProvider } from "../react-admin-provider";
import { ReviewListScreen } from "./review-list-screen";

/** Everything React Admin/Material UI for this screen, in one module, so the dynamic import in `review-list-app.tsx` is a single lazy chunk. */
export default function ReviewListRoot({
  signInPath,
  languages,
}: {
  signInPath: string;
  languages: { id: string; name: string }[];
}) {
  return (
    <ReactAdminProvider signInPath={signInPath}>
      <ReviewListScreen languages={languages} />
    </ReactAdminProvider>
  );
}
