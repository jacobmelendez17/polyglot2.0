import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "@/db/schema";

/**
 * The Neon serverless driver connects over a real WebSocket, and only
 * auto-detects a *global* `WebSocket` — which Next.js/`next dev`/Vitest all
 * provide (via the browser-like or Node 22+ environment they run under),
 * but AWS Lambda's `nodejs20.x` runtime does not reliably provide one
 * (confirmed directly: without this, every query failed with "All attempts
 * to open a WebSocket to connect to the database failed... TypeError: fetch
 * failed" — found via a synchronous `aws lambda invoke` during spec 19 §48
 * step 11's real end-to-end verification, since this Lambda has no
 * CloudWatch Logs permission to have surfaced it any other way). This is
 * exactly Neon's own documented fix for a plain Node environment:
 * https://github.com/neondatabase/serverless/blob/main/CONFIG.md#websocketconstructor-typeof-websocket--undefined
 */
neonConfig.webSocketConstructor = ws;

/**
 * Lambda-safe Neon binding (spec 19 §31/§48 step 8). Builds its own
 * `Pool`/`drizzle` client rather than importing `db/client.ts` — that
 * module's `import "server-only"` guard throws unconditionally outside a
 * webpack bundle with the `react-server` export condition set, which a
 * plain Lambda Node runtime never has (the same reason
 * `scripts/curriculum-import.ts` and every other CLI in `/scripts` build
 * their own client instead of importing the app's). The domain services
 * this Lambda calls (`bulk-import-service.ts`, `curriculum-import-service.ts`)
 * already accept an injected `DbClient` for exactly this reason.
 *
 * `DATABASE_URL` is **not** a plain Lambda environment variable, despite
 * spec 19 §42 listing it as one conceptually — this project's
 * `terraform.tfstate` is deliberately committed to git (a single-operator
 * sandbox account with no remote-state backend; see
 * `infra/terraform/environments/dev/main.tf`), and a Lambda environment
 * variable's value is stored in Terraform state as plain text. Committing
 * the real Neon connection string (password included) to git is exactly
 * what `code-standards.md`'s "never commit secrets" rule forbids. Instead
 * the Lambda receives `DATABASE_URL_PARAMETER_NAME` (not secret — just a
 * name) and fetches the real value from SSM Parameter Store
 * (`SecureString`) at cold start, caching it for the lifetime of the
 * execution environment (Lambda reuses this module across warm
 * invocations, so this is a real, meaningful cache, not a no-op).
 */
let cachedDatabaseUrl: string | null = null;

async function resolveDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  if (cachedDatabaseUrl) return cachedDatabaseUrl;

  const parameterName = process.env.DATABASE_URL_PARAMETER_NAME;
  if (!parameterName) {
    throw new Error(
      "Neither DATABASE_URL nor DATABASE_URL_PARAMETER_NAME is configured for the curriculum-import Lambda.",
    );
  }

  const ssm = new SSMClient({ region: process.env.AWS_REGION });
  const result = await ssm.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter "${parameterName}" has no value.`);
  }
  cachedDatabaseUrl = value;
  return value;
}

type LambdaDb = ReturnType<typeof drizzle<typeof schema>>;

// Cached at module scope, not inside the function, so a warm Lambda
// invocation (the module persists across invocations in the same execution
// environment) reuses one connection pool instead of opening a fresh one
// per message — cheap at batch-size-1/reserved-concurrency-1, but there's
// no reason to pay a new-connection round trip on every single invocation
// when the runtime hands us the same container back.
let cachedDb: LambdaDb | null = null;

export async function createLambdaDb(): Promise<LambdaDb> {
  if (cachedDb) return cachedDb;
  const databaseUrl = await resolveDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });
  cachedDb = drizzle(pool, { schema });
  return cachedDb;
}
