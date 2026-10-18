import { clientKey } from "./client-key";
import { checkReadiness, type ProbeDatabase } from "./readiness";
import { healthResponse, rateLimitedResponse } from "./respond";

/**
 * Spec 27 Unit 27.7 — readiness (`GET /api/health/ready`): "the application
 * can do its work" (spec 27 §9.1). 200 only if the critical settings are
 * present and the database answers within a bound; 503 otherwise. Rate limited
 * through the shared limiter, because it reaches the database — but a limiter
 * that is slow or down must not turn into a false outage, so it is given a
 * second and then ignored.
 *
 * Dependencies are handed in so each rule is provable without a server.
 */

type SharedLimiter = {
  check(input: {
    policy: "health-ready";
    subject: string;
  }): Promise<
    { allowed: true } | { allowed: false; retryAfterSeconds: number }
  >;
};

export type ReadinessDeps = {
  database: ProbeDatabase;
  settings: Readonly<Record<string, unknown>>;
  environment: string;
  /** Resolved lazily, per request: constructing the production limiter can itself fail. */
  limiter: () => SharedLimiter;
  warn: (fields: { event: string; reason: string }) => void;
  limiterTimeoutMs?: number;
  databaseTimeoutMs?: number;
};

async function withinTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T | "timed_out"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    work.catch(() => undefined);
    return await Promise.race([
      work,
      new Promise<"timed_out">((resolve) => {
        timer = setTimeout(() => resolve("timed_out"), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function handleReadiness(
  request: Request,
  deps: ReadinessDeps,
): Promise<Response> {
  // The limiter protects the database from being polled; it must never be the
  // reason a healthy application looks down, so any failure of it allows.
  try {
    const decision = await withinTimeout(
      Promise.resolve().then(() =>
        deps.limiter().check({
          policy: "health-ready",
          subject: clientKey(request.headers),
        }),
      ),
      deps.limiterTimeoutMs ?? 1_000,
    );
    if (decision !== "timed_out" && !decision.allowed) {
      return rateLimitedResponse(decision.retryAfterSeconds);
    }
  } catch {
    // Allowed: see above.
  }

  const report = await checkReadiness({
    database: deps.database,
    settings: deps.settings,
    environment: deps.environment,
    databaseTimeoutMs: deps.databaseTimeoutMs,
  });

  if (!report.ready) {
    // The failing check, by a fixed word: enough for a log alert, nothing to leak.
    deps.warn({
      event: "health.ready.failed",
      reason:
        report.checks.configuration === "failed"
          ? "configuration_missing"
          : "database_unreachable",
    });
  }
  // The status word only. Which check failed is for the operator, in the log
  // line above; a public body that named it would be dependency detail
  // (architecture.md, invariant 47).
  return healthResponse(report.ready ? 200 : 503, {
    status: report.ready ? "ready" : "unavailable",
  });
}
