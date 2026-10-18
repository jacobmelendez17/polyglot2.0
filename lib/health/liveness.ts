import { clientKey } from "./client-key";
import { BoundedWindowLimiter } from "./local-limiter";
import { healthResponse, rateLimitedResponse } from "./respond";

/**
 * Spec 27 Unit 27.7 — liveness (`GET /api/health`): "the application is
 * serving" (spec 27 §9.1). A constant answer with no database, provider, Redis
 * or even environment lookup — it must stay 200 while everything behind the
 * application is on fire, because that is what makes it a liveness signal. Rate
 * limited in process memory, for the same reason.
 *
 * Kept apart from readiness so this module's imports are as small as its
 * behaviour: nothing here reaches the database layer.
 */

const LIVENESS_LIMITER_DEFAULTS = { windowSeconds: 60, maxRequests: 120 };

export type LivenessDeps = {
  limiter: Pick<BoundedWindowLimiter, "check">;
  now?: () => number;
};

export function createLivenessLimiter(
  policy: {
    windowSeconds: number;
    maxRequests: number;
  } = LIVENESS_LIMITER_DEFAULTS,
): BoundedWindowLimiter {
  return new BoundedWindowLimiter(policy);
}

export function handleLiveness(request: Request, deps: LivenessDeps): Response {
  const decision = deps.limiter.check(clientKey(request.headers), deps.now?.());
  if (!decision.allowed) return rateLimitedResponse(decision.retryAfterSeconds);
  return healthResponse(200, { status: "ok" });
}
