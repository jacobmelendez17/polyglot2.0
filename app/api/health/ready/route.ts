import { db } from "@/db/client";
import { env } from "@/lib/env";
import { handleReadiness } from "@/lib/health/readiness-handler";
import { logger } from "@/lib/logging/logger";
import { getRateLimiter } from "@/providers/rate-limit";

/**
 * Spec 27 Unit 27.7 — readiness. Public; 200 only if the critical settings are
 * present and the database answers within a bound, 503 otherwise. Telemetry
 * outages (PostHog, Grafana) are not readiness failures. See
 * `lib/health/readiness-handler.ts`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleReadiness(request, {
    database: db,
    settings: env,
    environment: env.APP_ENV,
    limiter: getRateLimiter,
    warn: (fields) => logger.warn(fields),
  });
}
