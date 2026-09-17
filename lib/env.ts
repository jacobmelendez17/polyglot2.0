import { z } from "zod";

// Preview and production are both production Vercel builds and are not
// distinguishable by NODE_ENV — architecture.md requires a single APP_ENV
// value instead. Vercel sets VERCEL_ENV automatically on deployments; local
// dev has neither set, and is APP_ENV=development by default.
const resolvedAppEnv =
  process.env.APP_ENV ?? process.env.VERCEL_ENV ?? "development";

// Spec 24 (Structured Logging & Request Tracing) — "Production logs should
// identify the deployed application version... prefer git commit SHA."
// Vercel sets VERCEL_GIT_COMMIT_SHA automatically on every deployment; local
// dev and any environment without it falls back to "local" rather than
// failing the whole app over a non-authoritative diagnostic field.
const resolvedRelease = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";

const envSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().min(1),
  LESSON_STATE_SECRET: z.string().min(32),
  REVIEW_STATE_SECRET: z.string().min(32),
  APP_ENV: z.enum(["development", "preview", "production"]),
  DATABASE_URL: z.string().min(1),
  /**
   * Spec 20 Permanent Account Deletion — authenticates the Vercel Cron
   * request that finalizes due deletions (`app/api/cron/finalize-account-
   * deletions/route.ts`). Optional, unlike every other secret here: this
   * repo's local/test environments have no reason to run the finalize
   * job, and requiring it would break `npm run build`/`npm test`
   * everywhere it isn't set. Set it in the real deployment's environment
   * variables (matching Vercel's own documented Cron Jobs authentication
   * pattern) before the cron schedule in `vercel.json` goes live.
   */
  CRON_SECRET: z.string().min(32).optional(),
  /** Spec 24 — git commit SHA of the running deployment, attached to every structured log line. Never required: defaults to "local" outside Vercel. */
  RELEASE: z.string().min(1),
  /**
   * Spec 24 — overrides the logger's minimum level (default: "debug" in
   * development, "info" everywhere else). Optional; only worth setting to
   * temporarily raise verbosity in a deployed environment.
   */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
  LESSON_STATE_SECRET: process.env.LESSON_STATE_SECRET,
  REVIEW_STATE_SECRET: process.env.REVIEW_STATE_SECRET,
  APP_ENV: resolvedAppEnv,
  DATABASE_URL: process.env.DATABASE_URL,
  CRON_SECRET: process.env.CRON_SECRET,
  RELEASE: resolvedRelease,
  LOG_LEVEL: process.env.LOG_LEVEL,
});
