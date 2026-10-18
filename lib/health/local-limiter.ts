/**
 * Spec 27 Unit 27.7 — the liveness probe's rate limiter: a fixed window held in
 * this process's memory, and nowhere else.
 *
 * Liveness answers "is the application serving?" and may not depend on
 * anything that could be down, so it cannot use the Redis-backed limiter the
 * rest of the application uses. A per-instance limit is a weaker limit, which
 * is the right trade for a response that is a constant and costs nothing.
 *
 * The store is bounded. A caller who changes address on every request would
 * otherwise add an entry per request for the life of the instance; past
 * `maxKeys` the expired entries go first, then the oldest, and a key that is
 * evicted simply starts a new window.
 */

export type LocalLimitDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Window = { count: number; startedAt: number };

export class BoundedWindowLimiter {
  readonly #windowMs: number;
  readonly #maxRequests: number;
  readonly #maxKeys: number;
  readonly #windows = new Map<string, Window>();

  constructor(options: {
    windowSeconds: number;
    maxRequests: number;
    maxKeys?: number;
  }) {
    this.#windowMs = options.windowSeconds * 1000;
    this.#maxRequests = options.maxRequests;
    this.#maxKeys = options.maxKeys ?? 2_000;
  }

  check(key: string, now: number = Date.now()): LocalLimitDecision {
    const current = this.#windows.get(key);
    if (!current || now - current.startedAt >= this.#windowMs) {
      this.#makeRoom(key, now);
      this.#windows.set(key, { count: 1, startedAt: now });
      return { allowed: true };
    }
    if (current.count < this.#maxRequests) {
      current.count += 1;
      return { allowed: true };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.startedAt + this.#windowMs - now) / 1000),
      ),
    };
  }

  get size(): number {
    return this.#windows.size;
  }

  #makeRoom(incomingKey: string, now: number): void {
    // Re-inserting a key moves it to the end of the map's insertion order.
    this.#windows.delete(incomingKey);
    if (this.#windows.size < this.#maxKeys) return;
    for (const [key, window] of this.#windows) {
      if (now - window.startedAt >= this.#windowMs) this.#windows.delete(key);
    }
    while (this.#windows.size >= this.#maxKeys) {
      const oldest = this.#windows.keys().next();
      if (oldest.done) break;
      this.#windows.delete(oldest.value);
    }
  }
}
