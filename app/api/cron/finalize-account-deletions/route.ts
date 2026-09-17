import { NextResponse } from "next/server";

import { finalizeDueAccountDeletions } from "@/domains/danger-zone/server";
import { env } from "@/lib/env";
import { withRouteTrace } from "@/lib/logging/route-trace";

/**
 * Spec 20 Permanent Account Deletion — "a server-side scheduled process
 * finalizes deletion... do not use a client timer or an open browser tab."
 * Triggered daily by `vercel.json`'s cron schedule, which Vercel invokes
 * as an unauthenticated HTTP request carrying `Authorization: Bearer
 * <CRON_SECRET>` — this route's own job is only to check that header and
 * hand off to the real domain logic (`domains/danger-zone`'s
 * `finalizeDueAccountDeletions`).
 *
 * Public by design (`proxy.ts`'s route matcher never lists `/api/*` as
 * protected) — Clerk session auth doesn't apply here at all, since Vercel
 * Cron has no Clerk session; `CRON_SECRET` is the entire authentication
 * boundary. Not in `proxy.ts`'s protected-route list, and does not need to
 * be — this checks its own header directly.
 */
export async function GET(request: Request): Promise<Response> {
  return withRouteTrace("finalizeAccountDeletions", request, async () => {
    if (!env.CRON_SECRET) {
      // Not configured for this environment (local/test, or a deployment
      // that hasn't set it yet) — nothing to authenticate against, so refuse
      // rather than silently running an unauthenticated finalize job.
      return NextResponse.json(
        { error: "CRON_SECRET is not configured" },
        { status: 501 },
      );
    }

    const authorizationHeader = request.headers.get("authorization");
    if (authorizationHeader !== `Bearer ${env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await finalizeDueAccountDeletions(new Date());
    return NextResponse.json(result);
  });
}
