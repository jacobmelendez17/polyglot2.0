import { usePermissions } from "react-admin";

import type { AdminPermissions } from "@/domains/admin";

/**
 * The server's permission answer for the signed-in person, as React Admin's
 * `usePermissions` exposes it (it calls `authProvider.getPermissions`, which
 * asks `GET /api/v1/admin/me`).
 *
 * `usePermissions` caches for **five minutes** unless told otherwise, which
 * would let a revoked role keep showing privileged controls for that long.
 * Passing an explicit `staleTime` of zero opts out, so the answer is
 * re-fetched on every mount and whenever the tab regains focus (spec 26 §3:
 * "Role changes invalidate or refresh these permissions"). The server
 * re-checks every request regardless — this only keeps the UI honest.
 */
export function useAdminPermissions() {
  return usePermissions<AdminPermissions>({}, { staleTime: 0 });
}
