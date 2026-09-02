export type RateLimitPolicyName = "lesson-complete";

export type RateLimitPolicy = {
  windowSeconds: number;
  maxRequests: number;
  /**
   * Must be explicit per policy — never implicit or defaulted (spec 08 §54).
   * Progress-affecting mutations fail closed: if the store is unreachable,
   * the request is denied. Only a policy that explicitly sets this true may
   * fail open instead.
   */
  failOpen: boolean;
};

export type RateLimitCheckInput = {
  policy: RateLimitPolicyName;
  /** Internal Polyglot user ID on authenticated routes; an IP address is the fallback for unauthenticated ones. */
  subject: string;
};

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  check(input: RateLimitCheckInput): Promise<RateLimitDecision>;
}
