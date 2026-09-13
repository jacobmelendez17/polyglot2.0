/**
 * Recognizes a PostgreSQL unique-violation error (SQLSTATE `23505`) thrown
 * by an insert/update. Exists so a unique-constrained write can react to a
 * concurrent conflict by catching the database's own decision, rather than
 * a "check availability, then insert" race (code-standards.md's explicit
 * rule against that pattern — first needed for spec 20's username
 * uniqueness, but not username-specific).
 *
 * Drizzle's Postgres drivers (confirmed against the real Neon serverless
 * driver, both directly and through `withTestTransaction`'s real Postgres
 * transaction — see `user-repository.integration.test.ts`'s username-race
 * tests) wrap the underlying driver error in a `DrizzleQueryError`, which
 * puts the actual SQLSTATE on `.cause.code`, not `.code` on the thrown
 * error itself. Checking only the outer `.code` looked plausible but was
 * wrong — this checks one level of `.cause` for exactly that reason, rather
 * than trusting the shape without exercising a real constraint violation.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, "23505") || hasSqlState(getCause(error), "23505");
}

function getCause(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
}

function hasSqlState(error: unknown, sqlState: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === sqlState;
}
