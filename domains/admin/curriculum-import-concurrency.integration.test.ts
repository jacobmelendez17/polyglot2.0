import { randomUUID } from "node:crypto";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbClient } from "@/db/client";
import {
  adminAuditEvents,
  curriculumImports,
  languages,
  users,
} from "@/db/schema";
import { testDb } from "@/db/test/test-client";

import { getAuditEvents } from "./audit-repository";
import {
  archiveCurriculumImport,
  permanentlyDeleteCurriculumImport,
  unarchiveCurriculumImport,
} from "./curriculum-import-service";

/**
 * Spec 26 Unit 8 — archive, restore and permanently delete are reachable over
 * HTTP now, so two requests for one import can arrive together: a double click, a
 * client that retries a request it did not hear back from, two Admins. Each
 * command locks the import's row first (`lockCurriculumImportForUpdate`) so
 * that they take turns — but a row lock lasts only as long as the caller's
 * transaction, and these tests run each command the way the mutation service
 * does: `testDb.transaction((tx) => command(tx, …))`.
 *
 * The rolled-back single-transaction harness cannot produce two requests at
 * once, so these commit real rows (unique to each test) and remove them
 * afterwards, the same approach as `user-role-service.integration.test.ts`.
 * What binds the mutation service to a transaction is proven, with the pool
 * and the transaction told apart, in `admin-import-history-commands.test.ts`.
 */

const FILE_PREFIX = "concurrency-u8-";
const CLERK_PREFIX = "clerk-import-concurrency-";

async function languageId(db: DbClient): Promise<string> {
  const code = "es-MX";
  const [inserted] = await db
    .insert(languages)
    .values({ code, slug: `spanish-${randomUUID()}`, name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning();
  if (inserted) return inserted.id;
  const [existing] = await db
    .select()
    .from(languages)
    .where(eq(languages.code, code))
    .limit(1);
  return existing!.id;
}

async function makeAdmin(db: DbClient, language: string) {
  const [row] = await db
    .insert(users)
    .values({
      clerkUserId: `${CLERK_PREFIX}${randomUUID()}`,
      role: "admin",
      activeLanguageId: language,
    })
    .returning();
  return row!;
}

async function makeImport(
  db: DbClient,
  language: string,
  uploadedByUserId: string,
  options: { archived?: boolean } = {},
) {
  const id = randomUUID();
  await db.insert(curriculumImports).values({
    id,
    environment: "development",
    languageId: language,
    originalFilename: `${FILE_PREFIX}${id}.csv`,
    fileExtension: "csv",
    s3Bucket: "polyglot-dev-imports",
    s3Key: `imports/${id}/source.csv`,
    uploadedByUserId,
    ...(options.archived
      ? { archivedAt: sql`now()`, archivedByUserId: uploadedByUserId }
      : {}),
  });
  return id;
}

async function purge(importIds: string[], userIds: string[]) {
  if (importIds.length > 0) {
    await testDb
      .delete(adminAuditEvents)
      .where(
        and(
          eq(adminAuditEvents.resourceType, "curriculum_import"),
          inArray(adminAuditEvents.resourceId, importIds),
        ),
      );
    await testDb
      .delete(curriculumImports)
      .where(inArray(curriculumImports.id, importIds));
  }
  if (userIds.length > 0) {
    // Audit events name their actor with a restricting foreign key.
    await testDb
      .delete(adminAuditEvents)
      .where(inArray(adminAuditEvents.actorUserId, userIds));
    await testDb.delete(users).where(inArray(users.id, userIds));
  }
}

/**
 * What an interrupted run committed and never removed (a test that is killed or
 * times out cannot run its own `finally`). It would break unrelated tests that
 * expect an empty audit table, in a way that looks nothing like its cause.
 */
async function purgeLeftovers() {
  const leftImports = await testDb
    .select({ id: curriculumImports.id })
    .from(curriculumImports)
    .where(like(curriculumImports.originalFilename, `${FILE_PREFIX}%`));
  const leftUsers = await testDb
    .select({ id: users.id })
    .from(users)
    .where(like(users.clerkUserId, `${CLERK_PREFIX}%`));
  await purge(
    leftImports.map((row) => row.id),
    leftUsers.map((row) => row.id),
  );
}

/** Every command, run as the mutation service runs it: in a transaction of its own. */
const archive = (importId: string, actorUserId: string) =>
  testDb.transaction((tx) =>
    archiveCurriculumImport(tx, { importId, actorUserId }),
  );
const restore = (importId: string, actorUserId: string) =>
  testDb.transaction((tx) =>
    unarchiveCurriculumImport(tx, { importId, actorUserId }),
  );
const remove = (importId: string, actorUserId: string) =>
  testDb.transaction((tx) =>
    permanentlyDeleteCurriculumImport(tx, { importId, actorUserId }),
  );

const trail = async (importId: string): Promise<string[]> => {
  const rows = await testDb
    .select({ action: adminAuditEvents.action })
    .from(adminAuditEvents)
    .where(
      and(
        eq(adminAuditEvents.resourceType, "curriculum_import"),
        eq(adminAuditEvents.resourceId, importId),
      ),
    )
    .orderBy(adminAuditEvents.createdAt, adminAuditEvents.id);
  return rows.map((row) => row.action);
};

const stored = async (importId: string) =>
  (
    await testDb
      .select()
      .from(curriculumImports)
      .where(eq(curriculumImports.id, importId))
  )[0];

/**
 * Waits until some session is blocked on another transaction's row — proof the
 * command is really queued behind the one that holds it. If it instead
 * *finishes* without waiting, say how, rather than timing out blind.
 */
async function waitUntilSomeoneWaitsOnARow(
  outcome: () => { error?: unknown } | undefined,
) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const finished = outcome();
    if (finished) {
      throw new Error(
        `the command finished without waiting on the import's row: ${
          finished.error instanceof Error
            ? `${finished.error.name}: ${finished.error.message}`
            : "it succeeded"
        }`,
      );
    }
    const result = await testDb.execute(
      sql`select count(*)::int as n from pg_locks where locktype = 'transactionid' and not granted`,
    );
    const n = (result.rows[0] as { n: number } | undefined)?.n ?? 0;
    if (n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the command never waited on the import's row");
}

describe("import history commands — under concurrent requests (real transactions)", () => {
  beforeAll(purgeLeftovers);
  afterAll(purgeLeftovers);

  it("makes a second archive wait for the first, and then find the import already archived — one archive, one audit event", async () => {
    const language = await languageId(testDb);
    const admin = await makeAdmin(testDb, language);
    const importId = await makeImport(testDb, language, admin.id);
    try {
      let second: Promise<unknown> | undefined;
      await testDb.transaction(async (tx) => {
        // The first archive has done its work, and not yet committed it ...
        await archiveCurriculumImport(tx, {
          importId,
          actorUserId: admin.id,
        });
        // ... when the second one arrives.
        second = archive(importId, admin.id);
        let finished: { error?: unknown } | undefined;
        second.then(
          () => (finished = {}),
          (error) => (finished = { error }),
        );
        await waitUntilSomeoneWaitsOnARow(() => finished);
        // Leaving the callback commits the first.
      });
      await second;

      expect((await stored(importId))?.archivedAt).not.toBeNull();
      expect(await trail(importId)).toEqual(["CURRICULUM_IMPORT_ARCHIVED"]);
    } finally {
      await purge([importId], [admin.id]);
    }
  }, 30_000);

  it("archives once, and writes the audit event once, however many requests arrive together", async () => {
    const language = await languageId(testDb);
    const admin = await makeAdmin(testDb, language);
    try {
      for (let round = 0; round < 3; round++) {
        const importId = await makeImport(testDb, language, admin.id);
        const results = await Promise.allSettled([
          archive(importId, admin.id),
          archive(importId, admin.id),
          archive(importId, admin.id),
          archive(importId, admin.id),
        ]);

        // Repeating a command is a no-op, not an error: all four are answered.
        expect(results.map((result) => result.status)).toEqual([
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
        ]);
        expect((await stored(importId))?.archivedAt).not.toBeNull();
        expect(await trail(importId), `round ${round}`).toEqual([
          "CURRICULUM_IMPORT_ARCHIVED",
        ]);
        await purge([importId], []);
      }
    } finally {
      await purge([], [admin.id]);
    }
  }, 60_000);

  it("restores once, and writes the audit event once, however many requests arrive together", async () => {
    const language = await languageId(testDb);
    const admin = await makeAdmin(testDb, language);
    try {
      for (let round = 0; round < 3; round++) {
        const importId = await makeImport(testDb, language, admin.id, {
          archived: true,
        });
        const results = await Promise.allSettled([
          restore(importId, admin.id),
          restore(importId, admin.id),
          restore(importId, admin.id),
        ]);

        expect(results.every((result) => result.status === "fulfilled")).toBe(
          true,
        );
        expect((await stored(importId))?.archivedAt).toBeNull();
        expect(await trail(importId), `round ${round}`).toEqual([
          "CURRICULUM_IMPORT_RESTORED",
        ]);
        await purge([importId], []);
      }
    } finally {
      await purge([], [admin.id]);
    }
  }, 60_000);

  it("deletes once however many requests arrive together — one tombstone — and tells the others the import is gone", async () => {
    const language = await languageId(testDb);
    const admin = await makeAdmin(testDb, language);
    try {
      for (let round = 0; round < 3; round++) {
        const importId = await makeImport(testDb, language, admin.id, {
          archived: true,
        });
        const results = await Promise.allSettled([
          remove(importId, admin.id),
          remove(importId, admin.id),
          remove(importId, admin.id),
        ]);

        expect(
          results.filter((result) => result.status === "fulfilled"),
          `round ${round}: who deleted it`,
        ).toHaveLength(1);
        for (const result of results) {
          if (result.status === "rejected") {
            expect(result.reason).toMatchObject({
              code: "CURRICULUM_ITEM_NOT_FOUND",
            });
          }
        }
        expect(await stored(importId)).toBeUndefined();
        expect(await trail(importId)).toEqual(["CURRICULUM_IMPORT_DELETED"]);
        await purge([importId], []);
      }
    } finally {
      await purge([], [admin.id]);
    }
  }, 60_000);

  it("never leaves a trail that contradicts the import when a restore and a delete arrive together", async () => {
    const language = await languageId(testDb);
    const admin = await makeAdmin(testDb, language);
    try {
      for (let round = 0; round < 4; round++) {
        const importId = await makeImport(testDb, language, admin.id, {
          archived: true,
        });
        const [restored, deleted] = await Promise.allSettled([
          restore(importId, admin.id),
          remove(importId, admin.id),
        ]);

        const row = await stored(importId);
        const events = await trail(importId);
        if (deleted.status === "fulfilled") {
          // The delete went first: nothing is left to restore, and the trail
          // says only what happened.
          expect(restored.status, `round ${round}`).toBe("rejected");
          expect(row).toBeUndefined();
          expect(events).toEqual(["CURRICULUM_IMPORT_DELETED"]);
        } else {
          // The restore went first: the import is back in the history, and it
          // is no longer archived, so it cannot be deleted.
          expect(restored.status, `round ${round}`).toBe("fulfilled");
          expect(deleted.reason).toMatchObject({
            code: "CURRICULUM_VALIDATION_FAILED",
          });
          expect(row?.archivedAt).toBeNull();
          expect(events).toEqual(["CURRICULUM_IMPORT_RESTORED"]);
        }
        await purge([importId], []);
      }
    } finally {
      await purge([], [admin.id]);
    }
  }, 60_000);

  it("keeps what an audit event names in step with the import — read through the same reader the audit screen uses", async () => {
    const language = await languageId(testDb);
    const admin = await makeAdmin(testDb, language);
    const importId = await makeImport(testDb, language, admin.id);
    try {
      await archive(importId, admin.id);
      await restore(importId, admin.id);

      const page = await getAuditEvents(testDb, {
        resourceId: importId,
        limit: 10,
      });
      expect(page.items.map((event) => event.action).sort()).toEqual([
        "CURRICULUM_IMPORT_ARCHIVED",
        "CURRICULUM_IMPORT_RESTORED",
      ]);
      expect(page.items.every((event) => event.actorUserId === admin.id)).toBe(
        true,
      );
    } finally {
      await purge([importId], [admin.id]);
    }
  }, 30_000);
});
