/**
 * Spec 22 — fail-closed database safety guards.
 *
 * Every entry point that can migrate, seed, clean up, or run tests against
 * `TEST_DATABASE_URL`/`E2E_DATABASE_URL` calls the matching guard here first.
 * A guard either returns the verified connection string or throws — there is
 * no code path that falls back to `DATABASE_URL` or proceeds with an
 * unverified target. Error messages never include a connection string, only
 * the environment variable name, so a thrown error is always safe to log.
 */

function resolveAppEnv(): string {
  return process.env.APP_ENV ?? process.env.VERCEL_ENV ?? "development";
}

function assertNotProduction(varName: string): void {
  const appEnv = resolveAppEnv();
  if (appEnv === "production") {
    throw new Error(
      `Refusing to use ${varName}: APP_ENV is "production". Test/E2E databases must never run against a production environment.`,
    );
  }
}

function requireDistinctUrls(varName: string, url: string, otherVarName: string, otherUrl: string | undefined): void {
  if (otherUrl && url === otherUrl) {
    throw new Error(`Refusing to use ${varName}: it must not be equal to ${otherVarName}. Point it at a dedicated branch/database.`);
  }
}

/**
 * Verifies `TEST_DATABASE_URL` is safe to migrate/seed/query against
 * (spec 22's "Integration Database Safety Guard"). Called from
 * `db/test/global-setup.ts` and `db/test/test-client.ts` — every path that
 * touches the integration database.
 */
export function assertSafeIntegrationDatabaseUrl(): string {
  assertNotProduction("TEST_DATABASE_URL");

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is required to run database integration tests. Set it in .env.local — see .env.example.");
  }

  requireDistinctUrls("TEST_DATABASE_URL", testUrl, "DATABASE_URL", process.env.DATABASE_URL);

  return testUrl;
}

/**
 * Verifies `E2E_DATABASE_URL` is safe to reset/seed/run the Playwright suite
 * against (spec 22's "E2E Database Safety Guard"). Called from
 * `scripts/e2e-reset.ts` and `db/test/e2e-client.ts` — every path that
 * touches the E2E database.
 */
export function assertSafeE2EDatabaseUrl(): string {
  assertNotProduction("E2E_DATABASE_URL");

  const e2eUrl = process.env.E2E_DATABASE_URL;
  if (!e2eUrl) {
    throw new Error("E2E_DATABASE_URL is required to run the E2E suite. Set it in .env.local — see .env.example.");
  }

  requireDistinctUrls("E2E_DATABASE_URL", e2eUrl, "DATABASE_URL", process.env.DATABASE_URL);
  requireDistinctUrls("E2E_DATABASE_URL", e2eUrl, "TEST_DATABASE_URL", process.env.TEST_DATABASE_URL);

  return e2eUrl;
}
