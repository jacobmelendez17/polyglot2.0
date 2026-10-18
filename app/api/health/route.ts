import { createLivenessLimiter, handleLiveness } from "@/lib/health/liveness";
import { RATE_LIMIT_POLICIES } from "@/providers/rate-limit/policies";

/**
 * Spec 27 Unit 27.7 — liveness. Public, constant, never cached, and
 * deliberately free of anything that could be down: no database, no Redis, no
 * telemetry provider, no environment parsing (this module does not import
 * `lib/env`). `proxy.ts` leaves it out of Clerk's middleware for the same
 * reason. See `lib/health/liveness.ts`.
 */

export const dynamic = "force-dynamic";

const limiter = createLivenessLimiter(RATE_LIMIT_POLICIES["health-live"]);

export function GET(request: Request): Response {
  return handleLiveness(request, { limiter });
}
