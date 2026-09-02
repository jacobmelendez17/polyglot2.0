import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { RATE_LIMIT_POLICIES } from "./policies";
import type { RateLimitCheckInput, RateLimitDecision, RateLimiter, RateLimitPolicyName } from "./types";

function getUpstashCredentials(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required to construct UpstashRateLimiter.",
    );
  }
  return { url, token };
}

/**
 * Production/preview rate-limit backing store (spec 08 §1, §54). Credentials
 * are read lazily, at construction time, not at module import time — so this
 * file can be imported (e.g. for type-checking) without Upstash credentials
 * present; only actually *constructing* an instance requires them. No
 * consumer should import this directly — go through `./index.ts`.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly appEnv: string;
  private readonly redis: Redis;
  private readonly limiters = new Map<RateLimitPolicyName, Ratelimit>();

  constructor(appEnv: string) {
    this.appEnv = appEnv;
    const { url, token } = getUpstashCredentials();
    this.redis = new Redis({ url, token });
  }

  private getLimiter(policy: RateLimitPolicyName): Ratelimit {
    const existing = this.limiters.get(policy);
    if (existing) return existing;

    const config = RATE_LIMIT_POLICIES[policy];
    const limiter = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(config.maxRequests, `${config.windowSeconds} s`),
      prefix: `polyglot:${this.appEnv}:${policy}`,
    });
    this.limiters.set(policy, limiter);
    return limiter;
  }

  async check({ policy, subject }: RateLimitCheckInput): Promise<RateLimitDecision> {
    const config = RATE_LIMIT_POLICIES[policy];

    try {
      const result = await this.getLimiter(policy).limit(subject);
      if (result.success) return { allowed: true };
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      return { allowed: false, retryAfterSeconds };
    } catch (error) {
      // Store unreachable — fail closed unless the policy explicitly opts into failing open (spec 08 §54).
      console.error("rate_limit_store_unreachable", {
        policy,
        message: error instanceof Error ? error.message : String(error),
      });
      if (config.failOpen) return { allowed: true };
      return { allowed: false, retryAfterSeconds: config.windowSeconds };
    }
  }
}
