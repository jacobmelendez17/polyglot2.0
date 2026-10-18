import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { describe, expect, it } from "vitest";

import { assertSafeIntegrationDatabaseUrl } from "@/db/test/db-safety-guard";
import { testDb } from "@/db/test/test-client";

import {
  checkDatabase,
  checkReadiness,
  CRITICAL_SETTINGS,
  PRODUCTION_SETTINGS,
} from "./readiness";

/**
 * Spec 27 Unit 27.7 — readiness against a real PostgreSQL: that the probe's
 * query really is answered by the database, and that a database which refuses
 * the connection is reported as failed (within the bound, without throwing).
 *
 * The failing case uses the same isolated test branch with the wrong password,
 * so it is refused by the server rather than by a made-up address. Nothing here
 * touches the application database, and nothing is ever written.
 */

const SETTINGS = Object.fromEntries(
  [...CRITICAL_SETTINGS, ...PRODUCTION_SETTINGS].map((name) => [name, "set"]),
);

describe("readiness against the real database", () => {
  it("is ok when the database answers the probe's query", async () => {
    await expect(
      checkDatabase(testDb, { environment: "development" }),
    ).resolves.toBe("ok");
  });

  it("is ready with the critical settings present and the database answering", async () => {
    await expect(
      checkReadiness({
        database: testDb,
        settings: SETTINGS,
        environment: "development",
      }),
    ).resolves.toEqual({
      ready: true,
      checks: { configuration: "ok", database: "ok" },
    });
  });

  it("is not ready when the database refuses the connection, and says so quickly without throwing", async () => {
    const url = new URL(assertSafeIntegrationDatabaseUrl());
    url.password = "not-the-password";
    const pool = new Pool({ connectionString: url.toString() });
    const refusing = drizzle(pool);
    const startedAt = Date.now();

    try {
      await expect(
        checkReadiness({
          database: refusing,
          settings: SETTINGS,
          environment: "development",
          databaseTimeoutMs: 8_000,
        }),
      ).resolves.toEqual({
        ready: false,
        checks: { configuration: "ok", database: "failed" },
      });
      expect(Date.now() - startedAt).toBeLessThan(10_000);
    } finally {
      await pool.end().catch(() => undefined);
    }
  });
});
