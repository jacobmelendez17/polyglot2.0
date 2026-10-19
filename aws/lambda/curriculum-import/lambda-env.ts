/**
 * Stand-in for `@/lib/env` inside the curriculum-import Lambda bundle
 * (`scripts/lambda-build-options.mjs` aliases the real module to this file).
 *
 * `lib/env.ts` validates every application secret (Clerk keys, state secrets,
 * `DATABASE_URL`, ...) the moment it is imported, and throws when one is
 * missing. The Lambda has none of them by design — its database URL comes from
 * SSM — but the structured logger and the idempotency helper, both reached
 * through `bulk-import-service`, read `APP_ENV`, `RELEASE` and `LOG_LEVEL` from
 * it. Bundling the real module made every invocation fail while the bundle
 * loaded, before the handler ran (and the Lambda has no CloudWatch Logs to
 * show it). This file supplies only those three fields; `lambda-bundle.test.ts`
 * fails if the real module ever finds its way back into the bundle.
 */
export const env = {
  APP_ENV:
    process.env.POLYGLOT_ENV === "production" ? "production" : "development",
  RELEASE: "lambda",
  LOG_LEVEL: undefined as
    "debug" | "info" | "warn" | "error" | "fatal" | undefined,
};
