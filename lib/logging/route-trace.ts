import { NextResponse } from "next/server";

import { logger } from "./logger";
import { withTrace } from "./operation-tracer";

/**
 * Spec 24's "Request Boundaries — Route Handlers": wraps a route handler so
 * every request gets a fresh trace/request id, and the outcome (route,
 * method, status, duration) is always logged — success or failure — without
 * every route handler reimplementing the same try/catch/log boilerplate.
 *
 * Deliberately never logs the request body (spec's "Do not log request
 * bodies automatically").
 */
export async function withRouteTrace(
  route: string,
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const requestId =
    request.headers.get("x-request-id") ??
    request.headers.get("x-vercel-id") ??
    undefined;

  try {
    return await withTrace(
      `route.${route}`,
      async () => {
        const response = await handler();
        logger.info({
          event: "route.completed",
          route,
          method: request.method,
          status: response.status,
        });
        return response;
      },
      {
        level: "info",
        newTrace: true,
        requestId,
        fields: { route, method: request.method },
      },
    );
  } catch {
    // withTrace already logged the failure (route.<name>.failed) with full
    // context at the right level — this only guarantees callers never see a
    // raw unhandled exception instead of a well-formed response.
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please try again.",
        },
      },
      { status: 500 },
    );
  }
}
