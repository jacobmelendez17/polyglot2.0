import type { RateLimitPolicy, RateLimitPolicyName } from "./types";

/**
 * Named, centralized rate-limit policies (spec 08 §54). Call sites reference
 * a policy by name — never raw window/count numbers. `lesson-complete` is
 * the policy spec 07 unit 6 will consume once it exists; add further
 * policies here as their real consumers land, not speculatively ahead of them.
 */
export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  "lesson-complete": {
    windowSeconds: 60,
    maxRequests: 5,
    failOpen: false,
  },
};
