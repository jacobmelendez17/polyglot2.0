import { randomUUID } from "node:crypto";

import { eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import type { DbClient } from "@/db/client";
import {
  adminAuditEvents,
  idempotencyKeys,
  languages,
  users,
} from "@/db/schema";
import { testDb } from "@/db/test/test-client";
import {
  withTestTransaction,
  type TestTx,
} from "@/db/test/with-test-transaction";
import { listAdminUsers } from "@/domains/users/admin-user-repository";
import { updateDisplayName } from "@/domains/users/user-repository";
import { USER_ROLES, type UserRole } from "@/domains/users";
import { AdminError } from "@/lib/errors/admin-errors";
import { AppError } from "@/lib/errors/app-error";

import { getAuditEvents } from "./audit-repository";
import { applyUserRoleChange, changeUserRole } from "./user-role-service";

/**
 * A control for the one test that must make the audit write fail, so the claim
 * "the role change and its audit event are one transaction" is shown by making
 * the second half fail — not just asserted. Every other call passes through to
 * the real audit repository, against the real database.
 */
const audit = vi.hoisted(() => ({ failNext: false }));
vi.mock("./audit-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./audit-repository")>();
  return {
    ...actual,
    recordAuditEvent: async (
      ...args: Parameters<typeof actual.recordAuditEvent>
    ) => {
      if (audit.failNext) {
        audit.failNext = false;
        throw new Error("the audit store is unavailable");
      }
      return actual.recordAuditEvent(...args);
    },
  };
});

/**
 * Spec 26 Unit 6 — changing another real account's role. Real PostgreSQL: the
 * rules below are only as good as the database they run against.
 */

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

type NewUser = {
  role?: UserRole;
  displayName?: string | null;
  clerkUserId?: string | null;
  isSandbox?: boolean;
  sandboxOwnerUserId?: string | null;
};

async function makeUser(db: DbClient, language: string, user: NewUser = {}) {
  const [row] = await db
    .insert(users)
    .values({
      clerkUserId:
        user.clerkUserId === undefined
          ? `clerk-role-${randomUUID()}`
          : user.clerkUserId,
      role: user.role ?? "user",
      displayName: user.displayName ?? null,
      activeLanguageId: language,
      isSandbox: user.isSandbox ?? false,
      sandboxOwnerUserId: user.sandboxOwnerUserId ?? null,
    })
    .returning();
  return row!;
}

/** The version token a screen would hold: what the list shows for this account. */
async function tokenOf(db: DbClient, userId: string): Promise<string> {
  const page = await listAdminUsers(db, { search: userId, limit: 1 });
  return page.items[0]!.updatedAt;
}

/** A syntactically valid token, for a target the service refuses before it ever looks at the version. */
const ANY_TOKEN = "2026-03-01T12:00:00.000000Z";

/** A row without the two columns a role change is allowed to move (`role`, and `updatedAt`, its version token). */
const withoutRoleAndVersion = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([column]) => column !== "role" && column !== "updatedAt",
    ),
  );

const roleOf = async (db: DbClient, userId: string) =>
  (await db.select().from(users).where(eq(users.id, userId)))[0]?.role;

const auditCount = async (db: DbClient, resourceId: string) =>
  (
    await getAuditEvents(db, {
      action: "USER_ROLE_CHANGED",
      resourceId,
      limit: 50,
    })
  ).items.length;

/** Runs `call`, and returns the error it threw (failing the test if it did not throw). */
async function refusal(call: () => Promise<unknown>) {
  try {
    await call();
  } catch (error) {
    return error as AdminError | AppError;
  }
  throw new Error("expected the change to be refused");
}

/** An Admin, a person to change, and the key and token a screen would send. */
async function scene(
  tx: TestTx,
  target: NewUser = {},
  actor: NewUser = { role: "admin" },
) {
  const language = await languageId(tx);
  const admin = await makeUser(tx, language, actor);
  const person = await makeUser(tx, language, target);
  return {
    language,
    admin,
    person,
    request: async (overrides: Record<string, unknown> = {}) => ({
      actorUserId: admin.id,
      targetUserId: person.id,
      role: "writer" as UserRole,
      expectedUpdatedAt: await tokenOf(tx, person.id),
      idempotencyKey: randomUUID(),
      ...overrides,
    }),
  };
}

describe("changeUserRole — the change itself", () => {
  it("changes the role, advances the version token, and records USER_ROLE_CHANGED with everything the spec lists", async () => {
    await withTestTransaction(async (tx) => {
      const { admin, person, request } = await scene(tx, { role: "user" });
      const input = await request({
        role: "writer",
        reason: "Joined the content team",
      });
      // The clock inside a rolled-back test transaction does not move on its
      // own: put the row's last edit in the past, as a real earlier edit.
      await tx.execute(
        sql`update users set updated_at = updated_at - interval '1 minute' where id = ${person.id}`,
      );
      const staleToken = await tokenOf(tx, person.id);
      const result = await changeUserRole(tx, {
        ...input,
        expectedUpdatedAt: staleToken,
      });

      expect(result).toMatchObject({ userId: person.id, role: "writer" });
      expect(await roleOf(tx, person.id)).toBe("writer");
      // The token the screen now holds is the row's current one.
      expect(result.updatedAt).toBe(await tokenOf(tx, person.id));
      expect(result.updatedAt).not.toBe(staleToken);

      const events = (
        await getAuditEvents(tx, {
          action: "USER_ROLE_CHANGED",
          resourceId: person.id,
          limit: 10,
        })
      ).items;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorUserId: admin.id,
        action: "USER_ROLE_CHANGED",
        resourceType: "user",
        resourceId: person.id,
        beforeData: { role: "user" },
        afterData: { role: "writer" },
        reason: "Joined the content team",
        correlationId: input.idempotencyKey,
      });
      expect(events[0]!.createdAt).toBeInstanceOf(Date);
      // Nothing that identifies the person outside Polyglot is in the trail.
      expect(JSON.stringify(events[0])).not.toContain("clerk");
    });
  });

  // Every ordered pair of the five roles, including each way in and out of Admin.
  const PAIRS = USER_ROLES.flatMap((from) =>
    USER_ROLES.filter((to) => to !== from).map((to) => [from, to] as const),
  );
  it.each(PAIRS)("changes %s to %s", async (from, to) => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx, { role: from });

      const result = await changeUserRole(tx, await request({ role: to }));

      expect(result.role).toBe(to);
      expect(await roleOf(tx, person.id)).toBe(to);
      expect(await auditCount(tx, person.id)).toBe(1);
    });
  });

  it("records no reason as none, rather than an empty string", async () => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx);
      await changeUserRole(tx, await request());
      const [event] = (
        await getAuditEvents(tx, {
          action: "USER_ROLE_CHANGED",
          resourceId: person.id,
          limit: 5,
        })
      ).items;
      expect(event!.reason).toBeNull();
    });
  });

  it("lets a second change follow the first, using the token the first returned", async () => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx, { role: "user" });
      await tx.execute(
        sql`update users set updated_at = updated_at - interval '1 minute' where id = ${person.id}`,
      );
      const first = await changeUserRole(tx, await request({ role: "writer" }));

      const second = await changeUserRole(
        tx,
        await request({
          role: "developer",
          expectedUpdatedAt: first.updatedAt,
        }),
      );

      expect(second.role).toBe("developer");
      expect(await auditCount(tx, person.id)).toBe(2);
    });
  });

  describe("idempotency", () => {
    it("answers a repeat of the same request from the stored result, with one audit event", async () => {
      await withTestTransaction(async (tx) => {
        const { person, request } = await scene(tx);
        const input = await request();

        const first = await changeUserRole(tx, input);
        // The token is stale by now (the first call advanced it), which would
        // be a conflict — the stored answer is returned without re-checking.
        const replay = await changeUserRole(tx, input);

        expect(replay).toEqual(first);
        expect(await auditCount(tx, person.id)).toBe(1);
        expect(await roleOf(tx, person.id)).toBe("writer");
      });
    });

    it("refuses the same key for a different request", async () => {
      await withTestTransaction(async (tx) => {
        const { person, request } = await scene(tx);
        const input = await request();
        await changeUserRole(tx, input);

        const error = await refusal(() =>
          changeUserRole(tx, { ...input, role: "developer" }),
        );

        expect(error).toMatchObject({
          code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
        });
        expect(await roleOf(tx, person.id)).toBe("writer");
        expect(await auditCount(tx, person.id)).toBe(1);
      });
    });
  });

  it("writes exactly three things — the role and its token, one audit event, one idempotency key — and nothing about the person's learning", async () => {
    await withTestTransaction(async (tx) => {
      const { admin, person, request } = await scene(tx, {
        displayName: "Sam",
      });
      const [before] = await tx
        .select()
        .from(users)
        .where(eq(users.id, person.id));
      // Counted by *this* Admin, so nothing a parallel test commits can move them.
      const eventsBy = async () =>
        (await getAuditEvents(tx, { actorUserId: admin.id, limit: 50 })).items
          .length;
      const keysBy = async () =>
        (
          await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(idempotencyKeys)
            .where(eq(idempotencyKeys.userId, admin.id))
        )[0]!.n;
      expect([await eventsBy(), await keysBy()]).toEqual([0, 0]);

      await changeUserRole(tx, await request());

      const [after] = await tx
        .select()
        .from(users)
        .where(eq(users.id, person.id));
      // Every other column — profile, language, onboarding, sandbox flags — is as it was.
      expect(withoutRoleAndVersion(after!)).toEqual(
        withoutRoleAndVersion(before!),
      );
      expect([await eventsBy(), await keysBy()]).toEqual([1, 1]);
    });
  });
});

describe("changeUserRole — who may ask", () => {
  it.each(USER_ROLES.filter((role) => role !== "admin"))(
    "refuses a %s, whatever the route believed, and changes nothing",
    async (role) => {
      await withTestTransaction(async (tx) => {
        const { person, request } = await scene(tx, {}, { role });

        const error = await refusal(async () =>
          changeUserRole(tx, await request()),
        );

        expect(error).toMatchObject({ code: "FORBIDDEN" });
        expect(await roleOf(tx, person.id)).toBe("user");
        expect(await auditCount(tx, person.id)).toBe(0);
      });
    },
  );

  it("refuses an actor who does not exist", async () => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx);

      // Straight to the transactional step: the idempotency key's own foreign
      // key would stop a stranger before the check does, and the check is what
      // must hold when the person who asked has vanished since the route ran.
      const error = await refusal(async () =>
        applyUserRoleChange(tx, await request({ actorUserId: randomUUID() })),
      );

      expect(error).toMatchObject({ code: "FORBIDDEN" });
      expect(await roleOf(tx, person.id)).toBe("user");
    });
  });

  it("refuses an Admin who was demoted after the request was authorized", async () => {
    await withTestTransaction(async (tx) => {
      const { admin, person, request } = await scene(tx);
      const input = await request();
      // The route authorized this person as an Admin a moment ago; since then
      // another Admin demoted them.
      await tx
        .update(users)
        .set({ role: "writer" })
        .where(eq(users.id, admin.id));

      const error = await refusal(() => changeUserRole(tx, input));

      expect(error).toMatchObject({ code: "FORBIDDEN" });
      expect(await roleOf(tx, person.id)).toBe("user");
    });
  });
});

describe("changeUserRole — who it may be done to", () => {
  it.each(USER_ROLES.filter((role) => role !== "admin"))(
    "refuses an Admin changing their own role to %s",
    async (role) => {
      await withTestTransaction(async (tx) => {
        const { admin, request } = await scene(tx);

        const error = await refusal(async () =>
          changeUserRole(
            tx,
            await request({
              targetUserId: admin.id,
              role,
              expectedUpdatedAt: await tokenOf(tx, admin.id),
            }),
          ),
        );

        expect(error).toMatchObject({
          code: "USER_ROLE_CHANGE_NOT_ALLOWED",
          message: "You can't change your own role. Ask another Admin.",
        });
        expect(await roleOf(tx, admin.id)).toBe("admin");
        expect(await auditCount(tx, admin.id)).toBe(0);
      });
    },
  );

  // A persona has no sign-in, so "no Clerk identity" alone would refuse it —
  // which is why the second case matters: a persona row that carries a Clerk id
  // anyway (nothing in the schema forbids it) must still be refused for being a
  // persona, or one rule could silently stop covering what the other covered.
  it.each([
    ["a sandbox persona", null],
    ["a sandbox persona that somehow carries a Clerk identity", "clerk-odd"],
  ])("refuses %s", async (_name, clerkUserId) => {
    await withTestTransaction(async (tx) => {
      const { language, person, request } = await scene(tx);
      const persona = await makeUser(tx, language, {
        clerkUserId,
        isSandbox: true,
        sandboxOwnerUserId: person.id,
      });

      const error = await refusal(async () =>
        changeUserRole(
          tx,
          await request({
            targetUserId: persona.id,
            expectedUpdatedAt: ANY_TOKEN,
          }),
        ),
      );

      expect(error).toMatchObject({ code: "USER_ROLE_CHANGE_NOT_ALLOWED" });
      expect(await roleOf(tx, persona.id)).toBe("user");
      expect(await auditCount(tx, persona.id)).toBe(0);
    });
  });

  it("refuses an account with no Clerk identity, even if it is not marked as a sandbox", async () => {
    await withTestTransaction(async (tx) => {
      const { language, request } = await scene(tx);
      const unlinked = await makeUser(tx, language, { clerkUserId: null });

      const error = await refusal(async () =>
        changeUserRole(
          tx,
          await request({
            targetUserId: unlinked.id,
            expectedUpdatedAt: ANY_TOKEN,
          }),
        ),
      );

      expect(error).toMatchObject({ code: "USER_ROLE_CHANGE_NOT_ALLOWED" });
      expect(await roleOf(tx, unlinked.id)).toBe("user");
    });
  });

  it("refuses an account that does not exist", async () => {
    await withTestTransaction(async (tx) => {
      const { request } = await scene(tx);

      const error = await refusal(async () =>
        changeUserRole(
          tx,
          await request({
            targetUserId: randomUUID(),
            expectedUpdatedAt: ANY_TOKEN,
          }),
        ),
      );

      expect(error).toMatchObject({ code: "USER_NOT_FOUND" });
    });
  });

  it("refuses a role that is not one of the five", async () => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx);

      for (const role of ["superadmin", "", "ADMIN", "owner"]) {
        // The domain's own check, before it touches the database — not
        // Postgres refusing an unknown enum value afterwards, which would be a
        // fault (and a spent transaction) instead of a validation error.
        await expect(
          changeUserRole(tx, await request({ role })),
        ).rejects.toBeInstanceOf(ZodError);
        await expect(
          applyUserRoleChange(tx, await request({ role })),
        ).rejects.toBeInstanceOf(ZodError);
      }
      expect(await roleOf(tx, person.id)).toBe("user");
      expect(await auditCount(tx, person.id)).toBe(0);
    });
  });

  it("refuses to give someone the role they already have", async () => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx, { role: "writer" });

      const error = await refusal(async () =>
        changeUserRole(tx, await request({ role: "writer" })),
      );

      expect(error).toMatchObject({
        code: "USER_ROLE_CHANGE_NOT_ALLOWED",
        message: "That person already has that role.",
      });
      expect(await auditCount(tx, person.id)).toBe(0);
    });
  });

  describe("a stale view", () => {
    it("refuses a change made on a list that is out of date, because the person's account has changed since", async () => {
      await withTestTransaction(async (tx) => {
        const { person, request } = await scene(tx, {
          displayName: "Old name",
        });
        const input = await request();
        await tx.execute(
          sql`update users set updated_at = updated_at - interval '1 minute' where id = ${person.id}`,
        );
        // Anything that edits the row moves its token — here, the person renaming themselves.
        await updateDisplayName(tx, person.id, "New name");

        const error = await refusal(() => changeUserRole(tx, input));

        expect(error).toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
        expect(error.message).toContain("Reload");
        expect(await roleOf(tx, person.id)).toBe("user");
        expect(await auditCount(tx, person.id)).toBe(0);
      });
    });

    it("refuses a change made after another Admin has already changed that person's role", async () => {
      await withTestTransaction(async (tx) => {
        const { language, person, request } = await scene(tx);
        const otherAdmin = await makeUser(tx, language, { role: "admin" });
        const mine = await request({ role: "developer" });
        await tx.execute(
          sql`update users set updated_at = updated_at - interval '1 minute' where id = ${person.id}`,
        );
        const theirs = await request({
          actorUserId: otherAdmin.id,
          role: "writer",
        });
        await changeUserRole(tx, theirs);

        const error = await refusal(() => changeUserRole(tx, mine));

        expect(error).toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
        // Their change stands; mine did not overwrite it.
        expect(await roleOf(tx, person.id)).toBe("writer");
        expect(await auditCount(tx, person.id)).toBe(1);
      });
    });

    it("refuses a token that is merely rounded to the millisecond", async () => {
      await withTestTransaction(async (tx) => {
        const { person, request } = await scene(tx);
        await tx.execute(
          sql`update users set updated_at = timestamptz '2026-03-01 12:00:00.123456+00' where id = ${person.id}`,
        );

        const error = await refusal(async () =>
          changeUserRole(
            tx,
            await request({ expectedUpdatedAt: "2026-03-01T12:00:00.123Z" }),
          ),
        );

        expect(error).toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
      });
    });
  });

  describe("the last Admin", () => {
    it("refuses to demote the only real Admin left, however it is asked", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        // Every real Admin in the (shared) test database is made a non-Admin for
        // the length of this rolled-back transaction, so "the only one" is exact.
        await tx
          .update(users)
          .set({ role: "user" })
          .where(sql`${users.role} = 'admin'`);
        const onlyAdmin = await makeUser(tx, language, { role: "admin" });
        // The person asking holds the role but is not a real account (no Clerk
        // identity), so is not counted: as far as the count goes, `onlyAdmin` is it.
        const askingAdmin = await makeUser(tx, language, {
          role: "admin",
          clerkUserId: null,
        });

        const error = await refusal(async () =>
          changeUserRole(tx, {
            actorUserId: askingAdmin.id,
            targetUserId: onlyAdmin.id,
            role: "user",
            expectedUpdatedAt: await tokenOf(tx, onlyAdmin.id),
            idempotencyKey: randomUUID(),
          }),
        );

        expect(error).toMatchObject({ code: "LAST_ADMIN" });
        expect(await roleOf(tx, onlyAdmin.id)).toBe("admin");
        expect(await auditCount(tx, onlyAdmin.id)).toBe(0);
      });
    });

    it("allows the demotion once another real Admin exists", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        await tx
          .update(users)
          .set({ role: "user" })
          .where(sql`${users.role} = 'admin'`);
        const first = await makeUser(tx, language, { role: "admin" });
        const second = await makeUser(tx, language, { role: "admin" });

        const result = await changeUserRole(tx, {
          actorUserId: second.id,
          targetUserId: first.id,
          role: "writer",
          expectedUpdatedAt: await tokenOf(tx, first.id),
          idempotencyKey: randomUUID(),
        });

        expect(result.role).toBe("writer");
        expect(await roleOf(tx, second.id)).toBe("admin");
      });
    });

    it("does not count a sandbox persona that carries the Admin role as a second Admin", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        await tx
          .update(users)
          .set({ role: "user" })
          .where(sql`${users.role} = 'admin'`);
        const onlyAdmin = await makeUser(tx, language, { role: "admin" });
        const askingAdmin = await makeUser(tx, language, {
          role: "admin",
          clerkUserId: null,
        });
        await makeUser(tx, language, {
          role: "admin",
          clerkUserId: null,
          isSandbox: true,
          sandboxOwnerUserId: onlyAdmin.id,
        });

        const error = await refusal(async () =>
          changeUserRole(tx, {
            actorUserId: askingAdmin.id,
            targetUserId: onlyAdmin.id,
            role: "writer",
            expectedUpdatedAt: await tokenOf(tx, onlyAdmin.id),
            idempotencyKey: randomUUID(),
          }),
        );

        expect(error).toMatchObject({ code: "LAST_ADMIN" });
      });
    });
  });
});

describe("changeUserRole — one transaction", () => {
  it("leaves the role as it was, and the key free to use again, when the audit event cannot be written", async () => {
    await withTestTransaction(async (tx) => {
      const { person, request } = await scene(tx);
      const input = await request();

      audit.failNext = true;
      await expect(changeUserRole(tx, input)).rejects.toThrow(
        "the audit store is unavailable",
      );

      // The role update did not survive its missing audit event ...
      expect(await roleOf(tx, person.id)).toBe("user");
      expect(await auditCount(tx, person.id)).toBe(0);
      // ... and neither did the idempotency key, so the same request goes through
      // once the audit store is back — exactly once.
      const result = await changeUserRole(tx, input);
      expect(result.role).toBe("writer");
      expect(await auditCount(tx, person.id)).toBe(1);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concurrency: real, independently-committed transactions                    */
/* -------------------------------------------------------------------------- */

/**
 * The rolled-back single-transaction harness cannot produce two requests at
 * once, so these tests commit real rows (unique to each test) and remove them
 * afterwards — the same approach as `provisionUser`'s concurrency test.
 */
async function purge(ids: string[]) {
  if (ids.length === 0) return;
  // Audit events name their actor with a restricting foreign key; the
  // idempotency keys go with the users (cascade).
  await testDb
    .delete(adminAuditEvents)
    .where(inArray(adminAuditEvents.actorUserId, ids));
  await testDb.delete(users).where(inArray(users.id, ids));
}

/**
 * What an interrupted run of these tests committed and never removed (a test
 * that is killed or times out cannot run its own `finally`). It would break
 * *unrelated* tests that expect an empty audit table, in a way that looks
 * nothing like its cause — so the concurrency tests clear it before they start
 * and after they end, by the one pattern their users share.
 */
async function purgeLeftovers() {
  const left = await testDb
    .select({ id: users.id })
    .from(users)
    .where(like(users.clerkUserId, "clerk-role-%"));
  await purge(left.map((row) => row.id));
}

/**
 * Waits until some session is blocked on an advisory lock — proof the second
 * request is really queued behind the first. If it instead *finishes* (or
 * fails) without ever waiting, say how, rather than timing out blind.
 */
async function waitUntilSomeoneWaitsOnTheLock(
  outcome: () => { error?: unknown } | undefined,
) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const finished = outcome();
    if (finished) {
      throw new Error(
        `the second change finished without waiting on the role-change lock: ${
          finished.error instanceof Error
            ? `${finished.error.name}: ${finished.error.message}`
            : "it succeeded"
        }`,
      );
    }
    const result = await testDb.execute(
      sql`select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted`,
    );
    const n = (result.rows[0] as { n: number } | undefined)?.n ?? 0;
    if (n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("the second change never waited on the role-change lock");
}

/**
 * Waits until some session is blocked on another transaction's row — proof the
 * change is really queued behind an edit that has not committed yet.
 */
async function waitUntilSomeoneWaitsOnARow(
  outcome: () => { error?: unknown } | undefined,
) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const finished = outcome();
    if (finished) {
      throw new Error(
        `the change finished without waiting on the person's row: ${
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
  throw new Error("the change never waited on the person's row");
}

describe("changeUserRole — under concurrent requests (real transactions)", () => {
  beforeAll(purgeLeftovers);
  afterAll(purgeLeftovers);

  it("makes a second change wait for the first, and then refuses it if it came from an Admin the first one demoted", async () => {
    const language = await languageId(testDb);
    const a = await makeUser(testDb, language, { role: "admin" });
    const b = await makeUser(testDb, language, { role: "admin" });
    try {
      const tokenA = await tokenOf(testDb, a.id);
      const tokenB = await tokenOf(testDb, b.id);

      let second: Promise<unknown> | undefined;
      // Request 1 — A demotes B — holds the lock inside its own transaction ...
      await testDb.transaction(async (tx1) => {
        await applyUserRoleChange(tx1, {
          actorUserId: a.id,
          targetUserId: b.id,
          role: "user",
          expectedUpdatedAt: tokenB,
          idempotencyKey: randomUUID(),
        });
        // ... while request 2 — B demotes A — starts, and must queue behind it.
        // Run as a bare transaction, straight to the transactional step: through
        // `changeUserRole` it would stop even earlier, because its idempotency key
        // checks a foreign key on B's row, which request 1 holds locked. That is a
        // second line of defense by coincidence; this proves the one by design.
        second = testDb.transaction((tx2) =>
          applyUserRoleChange(tx2, {
            actorUserId: b.id,
            targetUserId: a.id,
            role: "user",
            expectedUpdatedAt: tokenA,
            idempotencyKey: randomUUID(),
          }),
        );
        let finished: { error?: unknown } | undefined;
        second.then(
          () => (finished = {}),
          (error) => (finished = { error }),
        );
        await waitUntilSomeoneWaitsOnTheLock(() => finished);
        // Leaving the callback commits request 1.
      });

      // Request 2 now runs, sees that its Admin has just been demoted, and stops.
      const error = await refusal(() => second!);
      expect(error).toMatchObject({ code: "FORBIDDEN" });

      // The result: A is still an Admin and B is not — never both demoted.
      expect(await roleOf(testDb, a.id)).toBe("admin");
      expect(await roleOf(testDb, b.id)).toBe("user");
      expect(await auditCount(testDb, b.id)).toBe(1);
      expect(await auditCount(testDb, a.id)).toBe(0);
    } finally {
      await purge([a.id, b.id]);
    }
  }, 30_000);

  it("makes a change that starts while another is in flight wait for it, then see what it did — and refuse a view that is now stale", async () => {
    const language = await languageId(testDb);
    const first = await makeUser(testDb, language, { role: "admin" });
    const second = await makeUser(testDb, language, { role: "admin" });
    const person = await makeUser(testDb, language, { role: "user" });
    try {
      const token = await tokenOf(testDb, person.id);

      let queued: Promise<unknown> | undefined;
      await testDb.transaction(async (tx1) => {
        await applyUserRoleChange(tx1, {
          actorUserId: first.id,
          targetUserId: person.id,
          role: "writer",
          expectedUpdatedAt: token,
          idempotencyKey: randomUUID(),
        });
        // The whole command, as the route runs it, from the same view of the list.
        queued = changeUserRole(testDb, {
          actorUserId: second.id,
          targetUserId: person.id,
          role: "developer",
          expectedUpdatedAt: token,
          idempotencyKey: randomUUID(),
        });
        let finished: { error?: unknown } | undefined;
        queued.then(
          () => (finished = {}),
          (error) => (finished = { error }),
        );
        await waitUntilSomeoneWaitsOnTheLock(() => finished);
      });

      const error = await refusal(() => queued!);
      expect(error).toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
      // The first change stands, once, and the second did not overwrite it.
      expect(await roleOf(testDb, person.id)).toBe("writer");
      expect(await auditCount(testDb, person.id)).toBe(1);
    } finally {
      await purge([first.id, second.id, person.id]);
    }
  }, 30_000);

  it("sees an edit to the person that commits while the change is in flight, and refuses the change as stale", async () => {
    // The role-change lock only serializes role changes. The person's own edits
    // (a rename) are not behind it, so what keeps "stale view → 409" true against
    // them is the row lock on the target: the change waits for the edit to
    // commit and then checks the version of what is committed — not of the row
    // as it was a moment earlier, which it would be checking against otherwise.
    const language = await languageId(testDb);
    const admin = await makeUser(testDb, language, { role: "admin" });
    const person = await makeUser(testDb, language, {
      role: "user",
      displayName: "Before",
    });
    try {
      const token = await tokenOf(testDb, person.id);

      let change: Promise<unknown> | undefined;
      await testDb.transaction(async (tx1) => {
        // The person edits their own account; the edit has not committed ...
        await tx1
          .update(users)
          .set({ displayName: "After" })
          .where(eq(users.id, person.id));
        // ... when the Admin's change, from a view that predates it, arrives.
        change = changeUserRole(testDb, {
          actorUserId: admin.id,
          targetUserId: person.id,
          role: "writer",
          expectedUpdatedAt: token,
          idempotencyKey: randomUUID(),
        });
        let finished: { error?: unknown } | undefined;
        change.then(
          () => (finished = {}),
          (error) => (finished = { error }),
        );
        await waitUntilSomeoneWaitsOnARow(() => finished);
        // Leaving the callback commits the edit.
      });

      const error = await refusal(() => change!);
      expect(error).toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
      expect(await roleOf(testDb, person.id)).toBe("user");
      expect(await auditCount(testDb, person.id)).toBe(0);
    } finally {
      await purge([admin.id, person.id]);
    }
  }, 30_000);

  it("never demotes both of two Admins who demote each other at the same moment", async () => {
    for (let round = 0; round < 3; round++) {
      const language = await languageId(testDb);
      const a = await makeUser(testDb, language, { role: "admin" });
      const b = await makeUser(testDb, language, { role: "admin" });
      try {
        const [tokenA, tokenB] = [
          await tokenOf(testDb, a.id),
          await tokenOf(testDb, b.id),
        ];

        const results = await Promise.allSettled([
          changeUserRole(testDb, {
            actorUserId: a.id,
            targetUserId: b.id,
            role: "user",
            expectedUpdatedAt: tokenB,
            idempotencyKey: randomUUID(),
          }),
          changeUserRole(testDb, {
            actorUserId: b.id,
            targetUserId: a.id,
            role: "user",
            expectedUpdatedAt: tokenA,
            idempotencyKey: randomUUID(),
          }),
        ]);

        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        const [roleA, roleB] = [
          await roleOf(testDb, a.id),
          await roleOf(testDb, b.id),
        ];
        // Exactly one Admin of the two remains.
        expect([roleA, roleB].filter((role) => role === "admin")).toHaveLength(
          1,
        );
      } finally {
        await purge([a.id, b.id]);
      }
    }
  }, 60_000);

  it("lets only one of two Admins change the same person from the same view", async () => {
    const language = await languageId(testDb);
    const a = await makeUser(testDb, language, { role: "admin" });
    const b = await makeUser(testDb, language, { role: "admin" });
    const person = await makeUser(testDb, language, { role: "user" });
    try {
      const token = await tokenOf(testDb, person.id);

      const results = await Promise.allSettled([
        changeUserRole(testDb, {
          actorUserId: a.id,
          targetUserId: person.id,
          role: "writer",
          expectedUpdatedAt: token,
          idempotencyKey: randomUUID(),
        }),
        changeUserRole(testDb, {
          actorUserId: b.id,
          targetUserId: person.id,
          role: "developer",
          expectedUpdatedAt: token,
          idempotencyKey: randomUUID(),
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: "ADMIN_EDIT_CONFLICT",
      });
      // One audit event, for the change that won.
      expect(await auditCount(testDb, person.id)).toBe(1);
      expect(["writer", "developer"]).toContain(
        await roleOf(testDb, person.id),
      );
    } finally {
      await purge([a.id, b.id, person.id]);
    }
  }, 30_000);
});
