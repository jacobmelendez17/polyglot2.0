import { NextResponse } from "next/server";

import {
  ADMIN_API_ERROR_STATUS,
  type AdminApiErrorCode,
} from "@/domains/admin";
import type { PolyglotUser } from "@/domains/users";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";
import { withRouteTrace } from "@/lib/logging/route-trace";

import { mapAdminApiError } from "./admin-api-errors";

/**
 * Privileged, per-user responses: never stored by a shared cache or the
 * browser (spec 26 §8 "Cache rules"). `Vary: Cookie` is belt-and-braces for
 * any intermediary that ignores `no-store`.
 */
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

function adminJson(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function errorResponse(
  route: string,
  code: AdminApiErrorCode,
  message: string,
): Response {
  // Authentication/authorization denials are already logged as
  // `auth.denied` (by `requireUser` and by `handleAdminGet`), where the
  // caller's id and role are known; logging them again here would double
  // every denial in the log.
  if (code !== "UNAUTHENTICATED" && code !== "FORBIDDEN") {
    logger.warn({ event: "admin_api.rejected", route, code });
  }
  return adminJson({ error: { code, message } }, ADMIN_API_ERROR_STATUS[code]);
}

type AdminGetRoute<T> = {
  /** Stable name for traces/logs, e.g. `admin.me`. */
  route: string;
  /**
   * One of `domains/admin/authorization.ts`'s predicates, evaluated on the
   * *database* role. Hidden navigation, a cached React Admin `canAccess`,
   * and the page/layout guard are never a substitute for this check.
   */
  authorize: (user: Pick<PolyglotUser, "role">) => boolean;
  /** Runs only after authentication and authorization succeeded. */
  load: (user: PolyglotUser) => Promise<T>;
};

/**
 * The single request pipeline for read endpoints under `/api/v1/admin/*`
 * (code-standards.md "API Routes"): authenticate -> authorize -> execute ->
 * respond with the `{ data }` / `{ error: { code, message } }` envelope.
 *
 * `proxy.ts` protects `/admin(.*)` pages only, so these handlers prove the
 * caller's identity themselves, from the real session and the real database
 * role, on every request — an endpoint reached without ever loading a page
 * is exactly as guarded as one reached from it.
 *
 * Expected failures become 4xx envelopes; anything else is re-thrown to
 * `withRouteTrace`, which logs it at ERROR and answers a generic 500.
 */
export async function handleAdminGet<T>(
  request: Request,
  { route, authorize, load }: AdminGetRoute<T>,
): Promise<Response> {
  return withRouteTrace(route, request, async () => {
    try {
      const user = await requireUser();
      if (!authorize(user)) {
        logger.warn({
          event: "auth.denied",
          reason: "forbidden",
          route,
          userId: user.id,
          role: user.role,
        });
        throw new AppError("FORBIDDEN");
      }
      return adminJson({ data: await load(user) }, 200);
    } catch (error) {
      const mapped = mapAdminApiError(error);
      if (!mapped) throw error;
      return errorResponse(route, mapped.code, mapped.message);
    }
  });
}
