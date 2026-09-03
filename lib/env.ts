import { z } from "zod";

// Preview and production are both production Vercel builds and are not
// distinguishable by NODE_ENV — architecture.md requires a single APP_ENV
// value instead. Vercel sets VERCEL_ENV automatically on deployments; local
// dev has neither set, and is APP_ENV=development by default.
const resolvedAppEnv = process.env.APP_ENV ?? process.env.VERCEL_ENV ?? "development";

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
});

export const env = envSchema.parse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
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
});
