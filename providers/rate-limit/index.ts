import "server-only";

import { env } from "@/lib/env";

import { InMemoryRateLimiter } from "./in-memory";
import { UpstashRateLimiter } from "./upstash";
import type { RateLimiter } from "./types";

let cachedLimiter: RateLimiter | null = null;

function createRateLimiter(): RateLimiter {
  const hasUpstashCredentials = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
  if (hasUpstashCredentials) {
    return new UpstashRateLimiter(env.APP_ENV);
  }
  // `lib/env.ts` already refuses to boot production without these; this is the
  // second line of defense so the in-memory limiter can never serve production.
  if (env.APP_ENV === "production") {
    throw new Error(
      "Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN; refusing to fall back to in-memory rate limiting.",
    );
  }
  // No Upstash credentials configured — local dev and every automated test
  // run land here. Never required for a test to pass (spec 08 §54).
  return new InMemoryRateLimiter({ appEnv: env.APP_ENV });
}

/**
 * The one entry point for rate limiting (spec 08 §54). Domain code expresses
 * intent — "this action, for this subject" — through this interface and
 * never talks to Upstash or the in-memory store directly.
 *
 * Not wired to any route in this spec — there is no user-facing
 * progress-affecting mutation yet (spec 07 unit 6 is the first consumer).
 */
export function getRateLimiter(): RateLimiter {
  cachedLimiter ??= createRateLimiter();
  return cachedLimiter;
}

export { RATE_LIMIT_POLICIES } from "./policies";
export type {
  RateLimitCheckInput,
  RateLimitDecision,
  RateLimiter,
  RateLimitPolicy,
  RateLimitPolicyName,
} from "./types";
