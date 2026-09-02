import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as a standalone CLI, outside Next.js's own env loading —
// load .env.local the same way `next dev`/`next build` do.
config({ path: ".env.local" });

// Deliberately reads process.env directly rather than lib/env.ts's parsed
// `env` — drizzle-kit runs as a standalone CLI outside the Next.js app, and
// lib/env.ts also requires Clerk/lesson vars that are irrelevant here.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run drizzle-kit. Set it in .env.local.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
