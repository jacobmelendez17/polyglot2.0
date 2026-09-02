import { RATE_LIMIT_POLICIES } from "./policies";
import type { RateLimitCheckInput, RateLimitDecision, RateLimiter, RateLimitPolicy, RateLimitPolicyName } from "./types";

type WindowState = { count: number; windowStartMs: number };

/**
 * Credential-free implementation used by all automated tests and local
 * development without Upstash configured (spec 08 §54). A simple
 * fixed-window counter — accuracy at the edge of a window isn't the point
 * here, only that limits are enforced deterministically and without any
 * external dependency.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly appEnv: string;
  private readonly windows = new Map<string, WindowState>();
  private readonly simulateFailure: () => boolean;
  private readonly policies: Record<RateLimitPolicyName, RateLimitPolicy>;

  constructor(options: {
    appEnv: string;
    simulateFailure?: () => boolean;
    /** Test-only: overrides the real named policies, so fail-open behavior can be exercised without a real fail-open policy existing yet. */
    policies?: Record<RateLimitPolicyName, RateLimitPolicy>;
  }) {
    this.appEnv = options.appEnv;
    this.simulateFailure = options.simulateFailure ?? (() => false);
    this.policies = options.policies ?? RATE_LIMIT_POLICIES;
  }

  async check({ policy, subject }: RateLimitCheckInput): Promise<RateLimitDecision> {
    const config = this.policies[policy];

    if (this.simulateFailure()) {
      // A store failure: fail closed unless this specific policy explicitly opted into failing open.
      return config.failOpen ? { allowed: true } : { allowed: false, retryAfterSeconds: config.windowSeconds };
    }

    // Namespaced by APP_ENV so preview and production (and, here, separate test runs) never share buckets.
    const key = `${this.appEnv}:${policy}:${subject}`;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const existing = this.windows.get(key);

    if (!existing || now - existing.windowStartMs >= windowMs) {
      this.windows.set(key, { count: 1, windowStartMs: now });
      return { allowed: true };
    }

    if (existing.count < config.maxRequests) {
      existing.count += 1;
      return { allowed: true };
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((existing.windowStartMs + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  /** Test-only: clears all counters between test cases. */
  reset(): void {
    this.windows.clear();
  }
}
