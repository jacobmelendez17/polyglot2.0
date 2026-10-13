import { NextResponse } from "next/server";
import type { z } from "zod";

import {
  ADMIN_API_ERROR_STATUS,
  type AdminApiErrorCode,
} from "@/domains/admin";
import type { PolyglotUser } from "@/domains/users";
import { requireUser } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";
import { withRouteTrace } from "@/lib/logging/route-trace";

import { AdminApiRequestError, mapAdminApiError } from "./admin-api-errors";
import {
  MAX_COMMAND_BODY_BYTES,
  assertCommandRequest,
  parseJsonBody,
  readBodyWithLimit,
} from "./request-guards";

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

function adminJson(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return NextResponse.json(body, {
    status,
    headers: { ...PRIVATE_HEADERS, ...extraHeaders },
  });
}

function errorResponse(
  route: string,
  code: AdminApiErrorCode,
  message: string,
  retryAfterSeconds?: number,
): Response {
  // Authentication/authorization denials are already logged as
  // `auth.denied` (by `requireUser` and by `handleAdminGet`), where the
  // caller's id and role are known; logging them again here would double
  // every denial in the log.
  if (code !== "UNAUTHENTICATED" && code !== "FORBIDDEN") {
    logger.warn({ event: "admin_api.rejected", route, code });
  }
  return adminJson(
    { error: { code, message } },
    ADMIN_API_ERROR_STATUS[code],
    // A rate-limited caller is told *when* to come back, as the standard
    // header (architecture.md "Rate Limiting"), not just in prose.
    retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {},
  );
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
  /**
   * Runs only after authentication and authorization succeeded — so an
   * unauthenticated caller always gets a 401, never a validation error that
   * would reveal this endpoint's parameters. Receives the request for its
   * query string; anything it throws that `mapAdminApiError` knows becomes a
   * 4xx envelope.
   */
  load: (user: PolyglotUser, request: Request) => Promise<T>;
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
      return adminJson({ data: await load(user, request) }, 200);
    } catch (error) {
      const mapped = mapAdminApiError(error);
      if (!mapped) throw error;
      return errorResponse(
        route,
        mapped.code,
        mapped.message,
        mapped.retryAfterSeconds,
      );
    }
  });
}

type AdminMutationRoute<TBody, TResult> = {
  /** Stable name for traces/logs, e.g. `admin.review.publish`. */
  route: string;
  /** The predicate for who may run this command, on the *database* role. */
  authorize: (user: Pick<PolyglotUser, "role">) => boolean;
  /** The command's JSON body. Strict schemas reject anything unexpected. */
  body: z.ZodType<TBody>;
  /**
   * Runs only after every guard passed. This calls the *same* domain service
   * the equivalent Server Action does — rate limiting, idempotency, the
   * optimistic-version check, audit, and cache invalidation all live there,
   * and none of it is repeated here.
   */
  execute: (user: PolyglotUser, body: TBody) => Promise<TResult>;
};

/**
 * The request pipeline for **state-changing** Admin commands (spec 26 §5),
 * in this order, each step cheaper and less revealing than the next:
 *
 * 1. **Same origin + JSON content type + no query string** — before anything
 *    else, so a cross-site request learns nothing and costs nothing.
 * 2. **Authenticate** from the real session, then
 * 3. **authorize** on the database role — so an unauthenticated or
 *    unauthorized caller never sees a validation error.
 * 4. **Read and validate the body** (size-capped, strict schema).
 * 5. **Execute** the domain command, and answer `{ data }`.
 *
 * A command is `POST`-only by construction: Next answers 405 for any method
 * the route file does not export. Unexpected failures re-throw to
 * `withRouteTrace` (logged at ERROR, generic 500).
 */
export async function handleAdminMutation<TBody, TResult>(
  request: Request,
  {
    route,
    authorize,
    body: bodySchema,
    execute,
  }: AdminMutationRoute<TBody, TResult>,
): Promise<Response> {
  return withRouteTrace(route, request, async () => {
    try {
      try {
        assertCommandRequest(request);
      } catch (error) {
        if (
          error instanceof AdminApiRequestError &&
          error.code === "FORBIDDEN"
        ) {
          // A cross-origin attempt to act as someone is worth a log line of
          // its own — and has no user to attach it to yet.
          logger.warn({ event: "auth.denied", reason: "cross_origin", route });
        }
        throw error;
      }

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

      const parsed = bodySchema.parse(
        parseJsonBody(await readBodyWithLimit(request, MAX_COMMAND_BODY_BYTES)),
      );
      return adminJson({ data: await execute(user, parsed) }, 200);
    } catch (error) {
      const mapped = mapAdminApiError(error);
      if (!mapped) throw error;
      return errorResponse(
        route,
        mapped.code,
        mapped.message,
        mapped.retryAfterSeconds,
      );
    }
  });
}
