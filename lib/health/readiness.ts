import { sql } from "drizzle-orm";

import {
  recordDatabaseConnectionFailure,
  recordDatabaseOperation,
} from "@/lib/observability/instruments";

/**
 * Spec 27 Unit 27.7 — what "ready" means (spec 27 §9.1): the settings the
 * application cannot run without are present, and the database answers within a
 * bound. Nothing else. PostHog and Grafana are optional telemetry; when either
 * is down the application is exactly as ready as before, so neither is checked.
 *
 * The result is two words per check — never an error message, a host, a setting
 * name or a version, because the endpoint is public.
 */

export type CheckStatus = "ok" | "failed";

export type ReadinessReport = {
  ready: boolean;
  checks: { configuration: CheckStatus; database: CheckStatus };
};

/** Without any of these nothing works: sign-in, signed lesson and review state, the database. */
export const CRITICAL_SETTINGS = [
  "DATABASE_URL",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "LESSON_STATE_SECRET",
  "REVIEW_STATE_SECRET",
] as const;

/** Rate limiting is required in production, where the in-memory fallback is no limit at all. */
export const PRODUCTION_SETTINGS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

export const DATABASE_TIMEOUT_MS = 2_500;

function present(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function checkConfiguration(
  settings: Readonly<Record<string, unknown>>,
  appEnvironment: string,
): CheckStatus {
  const required: readonly string[] =
    appEnvironment === "production"
      ? [...CRITICAL_SETTINGS, ...PRODUCTION_SETTINGS]
      : CRITICAL_SETTINGS;
  return required.every((name) => present(settings[name])) ? "ok" : "failed";
}

export type ProbeDatabase = { execute(query: ReturnType<typeof sql>): unknown };

export async function checkDatabase(
  database: ProbeDatabase,
  options: { environment: string; timeoutMs?: number },
): Promise<CheckStatus> {
  const timeoutMs = options.timeoutMs ?? DATABASE_TIMEOUT_MS;
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const query = Promise.resolve(database.execute(sql`select 1`));
    // If the timeout wins, the query is abandoned; its eventual outcome (it
    // may well reject once the connection gives up) must not surface as an
    // unhandled rejection.
    query.catch(() => undefined);
    await Promise.race([
      query,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("database check timed out")),
          timeoutMs,
        );
      }),
    ]);
    recordDatabaseOperation({
      environment: options.environment,
      operation: "readiness_check",
      outcome: "success",
      durationMs: performance.now() - startedAt,
    });
    return "ok";
  } catch {
    recordDatabaseOperation({
      environment: options.environment,
      operation: "readiness_check",
      outcome: "failure",
      durationMs: performance.now() - startedAt,
    });
    recordDatabaseConnectionFailure({
      environment: options.environment,
      provider: "neon",
    });
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

export async function checkReadiness(deps: {
  database: ProbeDatabase;
  settings: Readonly<Record<string, unknown>>;
  environment: string;
  databaseTimeoutMs?: number;
}): Promise<ReadinessReport> {
  const configuration = checkConfiguration(deps.settings, deps.environment);
  const database = await checkDatabase(deps.database, {
    environment: deps.environment,
    timeoutMs: deps.databaseTimeoutMs,
  });
  return {
    ready: configuration === "ok" && database === "ok",
    checks: { configuration, database },
  };
}
