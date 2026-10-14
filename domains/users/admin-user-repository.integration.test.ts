import { randomUUID } from "node:crypto";

import { eq, sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, users } from "@/db/schema";
import {
  withTestTransaction,
  type TestTx,
} from "@/db/test/with-test-transaction";
import { AppError } from "@/lib/errors/app-error";

import {
  countRealAdmins,
  getRoleChangeTarget,
  getUserRole,
  listAdminUsers,
  setUserRole,
} from "./admin-user-repository";
import { USER_ROLES, type UserRole } from "./user-types";

/**
 * Spec 26 Unit 6 — the Admin console's read model of accounts, and the
 * primitives a role change is built from. Real PostgreSQL, rolled back.
 *
 * The test database is shared with the seeded fixtures, which hold real
 * (Clerk-linked) accounts of their own, so every list assertion searches for a
 * tag unique to the test rather than counting the whole table.
 */

async function languageId(tx: TestTx): Promise<string> {
  const code = "es-MX";
  const [inserted] = await tx
    .insert(languages)
    .values({ code, slug: `spanish-${randomUUID()}`, name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning();
  if (inserted) return inserted.id;
  const [existing] = await tx
    .select()
    .from(languages)
    .where(eq(languages.code, code))
    .limit(1);
  return existing!.id;
}

type NewUser = {
  role?: UserRole;
  displayName?: string | null;
  username?: string | null;
  clerkUserId?: string | null;
  isSandbox?: boolean;
  sandboxOwnerUserId?: string | null;
  createdAt?: SQL;
};

async function makeUser(tx: TestTx, language: string, user: NewUser = {}) {
  const [row] = await tx
    .insert(users)
    .values({
      clerkUserId:
        user.clerkUserId === undefined
          ? `clerk-test-${randomUUID()}`
          : user.clerkUserId,
      role: user.role ?? "user",
      displayName: user.displayName ?? null,
      username: user.username ?? null,
      activeLanguageId: language,
      isSandbox: user.isSandbox ?? false,
      sandboxOwnerUserId: user.sandboxOwnerUserId ?? null,
      ...(user.createdAt ? { createdAt: user.createdAt } : {}),
    })
    .returning();
  return row!;
}

/** A row without the two columns a role change is allowed to move (`role`, and `updatedAt`, its version token). */
const withoutRoleAndVersion = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([column]) => column !== "role" && column !== "updatedAt",
    ),
  );

const tag = () => `rt${randomUUID().slice(0, 8)}`;
/** A timestamp that differs from its neighbours by *microseconds* — below what a JavaScript `Date` can hold. */
const microsAfterEpoch = (n: number) =>
  sql`timestamptz '2026-03-01 12:00:00+00' + (${n} * interval '1 microsecond')`;

describe("listAdminUsers — what an Admin may see of an account", () => {
  it("shows a real account with exactly the safe fields and nothing else", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const t = tag();
      await makeUser(tx, language, {
        role: "writer",
        displayName: `${t} Ana`,
        username: `${t}_ana`,
      });

      const page = await listAdminUsers(tx, { search: t, limit: 10 });

      expect(page.items).toHaveLength(1);
      const [record] = page.items;
      expect(Object.keys(record!).sort()).toEqual([
        "createdAt",
        "displayName",
        "id",
        "role",
        "updatedAt",
        "username",
      ]);
      expect(record).toMatchObject({
        role: "writer",
        displayName: `${t} Ana`,
        username: `${t}_ana`,
      });
      // Microsecond text, in UTC — the form a version token has to take.
      expect(record!.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
      );
      expect(record!.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
      );
      // No Clerk identity, in any form, anywhere in the answer.
      expect(JSON.stringify(page)).not.toContain("clerk");
    });
  });

  it("never lists a sandbox persona or an account with no Clerk identity", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const t = tag();
      const owner = await makeUser(tx, language, { displayName: `${t} owner` });
      await makeUser(tx, language, {
        displayName: `${t} persona`,
        clerkUserId: null,
        isSandbox: true,
        sandboxOwnerUserId: owner.id,
      });
      // Each rule on its own: a persona has no sign-in, so "no Clerk identity"
      // alone would hide it — a persona row that carries a Clerk id anyway
      // (nothing in the schema forbids one) must still be hidden for being a persona.
      await makeUser(tx, language, {
        displayName: `${t} odd persona`,
        clerkUserId: `clerk-odd-${t}`,
        isSandbox: true,
        sandboxOwnerUserId: owner.id,
      });
      await makeUser(tx, language, {
        displayName: `${t} unlinked`,
        clerkUserId: null,
      });

      const page = await listAdminUsers(tx, { search: t, limit: 10 });

      expect(page.items.map((item) => item.displayName)).toEqual([
        `${t} owner`,
      ]);
    });
  });

  describe("search", () => {
    it("finds an account by its whole id — in either case — and never by part of one", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const person = await makeUser(tx, language, {
          displayName: `Someone ${tag()}`,
        });
        const found = async (term: string) =>
          (await listAdminUsers(tx, { search: term, limit: 10 })).items.map(
            (item) => item.id,
          );

        expect(await found(person.id)).toEqual([person.id]);
        expect(await found(person.id.toUpperCase())).toEqual([person.id]);
        // Part of an id is not an id: it is not a way to enumerate accounts.
        for (const part of [
          person.id.slice(0, 8),
          person.id.slice(9, 13),
          person.id.slice(0, 23),
          person.id.slice(1),
        ]) {
          expect(await found(part), part).not.toContain(person.id);
        }
      });
    });

    it("matches a display name or a username, case-insensitively, anywhere in it", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const t = tag();
        await makeUser(tx, language, { displayName: `Maria ${t}Lopez` });
        await makeUser(tx, language, {
          displayName: null,
          username: `${t}_Jorge`,
        });
        await makeUser(tx, language, { displayName: `Someone ${t} Else` });

        const names = async (term: string) =>
          (await listAdminUsers(tx, { search: term, limit: 10 })).items
            .map((item) => item.displayName ?? item.username)
            .sort();

        expect(await names(`maria ${t}`)).toEqual([`Maria ${t}Lopez`]);
        expect(await names(`${t}LOPEZ`)).toEqual([`Maria ${t}Lopez`]);
        expect(await names(`${t}_jor`)).toEqual([`${t}_Jorge`]);
        expect(await names(t)).toHaveLength(3);
        expect(await names(`${t} nobody`)).toEqual([]);
      });
    });

    it("finds an account by its exact id — the id an audit entry names", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const person = await makeUser(tx, language, {
          displayName: `${tag()} Pat`,
        });
        await makeUser(tx, language, { displayName: `${tag()} Other` });

        const page = await listAdminUsers(tx, { search: person.id, limit: 10 });

        expect(page.items.map((item) => item.id)).toEqual([person.id]);
      });
    });

    it("treats % _ and \\ as the characters they are, not as wildcards", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const t = tag();
        await makeUser(tx, language, { displayName: `100% sure_ok ${t}` });
        await makeUser(tx, language, { displayName: `1000 surexok ${t}` });
        await makeUser(tx, language, { displayName: `back\\slash ${t}` });

        const names = async (term: string) =>
          (await listAdminUsers(tx, { search: term, limit: 10 })).items
            .map((item) => item.displayName)
            .sort();

        // If `_` were a wildcard, "sure_ok" would match "surexok" as well.
        expect(await names(`sure_ok ${t}`)).toEqual([`100% sure_ok ${t}`]);
        // If `%` were, "100%" would match "1000 …" too.
        expect(await names(`100% sure_ok ${t}`)).toEqual([`100% sure_ok ${t}`]);
        // A backslash is a backslash, not the start of an escape.
        expect(await names(`back\\slash ${t}`)).toEqual([`back\\slash ${t}`]);
        // And a lone wildcard in front of the tag matches nothing: no name has "% <tag>".
        expect(await names(`% ${t}`)).toEqual([]);
        expect(await names(`_ ${t}`)).toEqual([]);
      });
    });

    it("does not let a term be read as SQL", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const t = tag();
        await makeUser(tx, language, { displayName: `${t} Quinn` });

        const page = await listAdminUsers(tx, {
          search: `${t}' OR '1'='1`,
          limit: 10,
        });

        expect(page.items).toEqual([]);
      });
    });
  });

  describe("paging", () => {
    /** Five accounts whose creation times differ by microseconds — all inside one millisecond. */
    async function fiveWithinOneMillisecond(tx: TestTx) {
      const language = await languageId(tx);
      const t = tag();
      const made = [];
      for (const [index, micros] of [100, 200, 300, 400, 500].entries()) {
        made.push(
          await makeUser(tx, language, {
            displayName: `${t} #${index + 1}`,
            createdAt: microsAfterEpoch(micros),
          }),
        );
      }
      return { t, made };
    }

    it("lists newest first, by creation time and then id", async () => {
      await withTestTransaction(async (tx) => {
        const { t } = await fiveWithinOneMillisecond(tx);
        const page = await listAdminUsers(tx, { search: t, limit: 10 });
        expect(page.items.map((item) => item.displayName)).toEqual([
          `${t} #5`,
          `${t} #4`,
          `${t} #3`,
          `${t} #2`,
          `${t} #1`,
        ]);
        expect(page.nextCursor).toBeNull();
        expect(page.hasPreviousPage).toBe(false);
      });
    });

    it("walks forward through every account exactly once — including accounts created within one millisecond of each other", async () => {
      await withTestTransaction(async (tx) => {
        const { t } = await fiveWithinOneMillisecond(tx);

        const seen: string[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
          const page = await listAdminUsers(tx, {
            search: t,
            limit: 2,
            cursor,
          });
          seen.push(...page.items.map((item) => item.displayName!));
          cursor = page.nextCursor ?? undefined;
          pages += 1;
        } while (cursor && pages < 10);

        // Rounded to milliseconds, the cursor would skip #3 or #2 here.
        expect(seen).toEqual([
          `${t} #5`,
          `${t} #4`,
          `${t} #3`,
          `${t} #2`,
          `${t} #1`,
        ]);
        expect(pages).toBe(3);
      });
    });

    it("walks backward too, from a cursor alone — with the first page needing no cursor", async () => {
      await withTestTransaction(async (tx) => {
        const { t } = await fiveWithinOneMillisecond(tx);

        const first = await listAdminUsers(tx, { search: t, limit: 2 });
        const second = await listAdminUsers(tx, {
          search: t,
          limit: 2,
          cursor: first.nextCursor!,
        });
        const third = await listAdminUsers(tx, {
          search: t,
          limit: 2,
          cursor: second.nextCursor!,
        });
        expect(third.items.map((i) => i.displayName)).toEqual([`${t} #1`]);
        expect(third.nextCursor).toBeNull();
        expect(third.hasPreviousPage).toBe(true);

        // Back from page three: page two, whose own "previous" is page one.
        const backToSecond = await listAdminUsers(tx, {
          search: t,
          limit: 2,
          cursor: third.previousCursor!,
        });
        expect(backToSecond.items.map((i) => i.displayName)).toEqual(
          second.items.map((i) => i.displayName),
        );
        expect(backToSecond.hasPreviousPage).toBe(true);
        // Page one is the first page: it exists, and it needs no cursor.
        expect(backToSecond.previousCursor).toBeNull();
        const backToFirst = await listAdminUsers(tx, {
          search: t,
          limit: 2,
          cursor: backToSecond.previousCursor ?? undefined,
        });
        expect(backToFirst.items.map((i) => i.displayName)).toEqual(
          first.items.map((i) => i.displayName),
        );
        expect(backToFirst.hasPreviousPage).toBe(false);
      });
    });

    it("does not move an account between pages when its role changes", async () => {
      await withTestTransaction(async (tx) => {
        const { t, made } = await fiveWithinOneMillisecond(tx);
        const before = await listAdminUsers(tx, { search: t, limit: 10 });

        await setUserRole(tx, made[2]!.id, "writer");

        const after = await listAdminUsers(tx, { search: t, limit: 10 });
        expect(after.items.map((item) => item.id)).toEqual(
          before.items.map((item) => item.id),
        );
        expect(after.items.find((item) => item.id === made[2]!.id)?.role).toBe(
          "writer",
        );
      });
    });
  });

  describe("what it refuses", () => {
    it.each([
      ["not base64", "%%%not-a-cursor%%%"],
      ["valid base64, not JSON", Buffer.from("hello").toString("base64url")],
      [
        "JSON of the wrong shape",
        Buffer.from(JSON.stringify({ x: 1 })).toString("base64url"),
      ],
      [
        "a timestamp that is not a timestamp",
        Buffer.from(
          JSON.stringify({ c: "'; drop table users; --", i: randomUUID() }),
        ).toString("base64url"),
      ],
      [
        "an id that is not an id",
        Buffer.from(
          JSON.stringify({ c: "2026-03-01T12:00:00.000100Z", i: "nope" }),
        ).toString("base64url"),
      ],
      [
        "a timestamp rounded to milliseconds",
        Buffer.from(
          JSON.stringify({ c: "2026-03-01T12:00:00.000Z", i: randomUUID() }),
        ).toString("base64url"),
      ],
    ])("rejects a tampered cursor: %s", async (_name, cursor) => {
      await withTestTransaction(async (tx) => {
        await expect(
          listAdminUsers(tx, { limit: 5, cursor }),
        ).rejects.toBeInstanceOf(AppError);
      });
    });

    it.each([[0], [-1], [51], [1.5]])(
      "rejects a page size of %s",
      async (n) => {
        await withTestTransaction(async (tx) => {
          await expect(listAdminUsers(tx, { limit: n })).rejects.toThrow();
        });
      },
    );

    it("rejects an empty or oversized search rather than listing everyone", async () => {
      await withTestTransaction(async (tx) => {
        await expect(
          listAdminUsers(tx, { search: "   ", limit: 5 }),
        ).rejects.toThrow();
        await expect(
          listAdminUsers(tx, { search: "x".repeat(101), limit: 5 }),
        ).rejects.toThrow();
      });
    });
  });
});

describe("the role-change primitives", () => {
  it("reads one account's role fresh, and nothing for an id that does not exist", async () => {
    await withTestTransaction(async (tx) => {
      const language = await languageId(tx);
      const person = await makeUser(tx, language, { role: "developer" });
      expect(await getUserRole(tx, person.id)).toBe("developer");
      expect(await getUserRole(tx, randomUUID())).toBeNull();
    });
  });

  describe("getRoleChangeTarget — the version token", () => {
    it("matches the token the list handed out, exactly", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const t = tag();
        await makeUser(tx, language, { displayName: `${t} A` });
        const [record] = (await listAdminUsers(tx, { search: t, limit: 5 }))
          .items;

        const target = await getRoleChangeTarget(
          tx,
          record!.id,
          record!.updatedAt,
        );
        expect(target).toMatchObject({
          id: record!.id,
          role: "user",
          isSandbox: false,
          hasClerkIdentity: true,
          versionMatches: true,
        });
      });
    });

    it("does not match a token that is one microsecond off — a rounded token can never pass for the row it came from", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const person = await makeUser(tx, language);
        await tx.execute(
          sql`update users set updated_at = timestamptz '2026-03-01 12:00:00.123456+00' where id = ${person.id}`,
        );

        const exact = await getRoleChangeTarget(
          tx,
          person.id,
          "2026-03-01T12:00:00.123456Z",
        );
        const off = await getRoleChangeTarget(
          tx,
          person.id,
          "2026-03-01T12:00:00.123457Z",
        );
        const rounded = await getRoleChangeTarget(
          tx,
          person.id,
          "2026-03-01T12:00:00.123Z",
        );

        expect(exact?.versionMatches).toBe(true);
        expect(off?.versionMatches).toBe(false);
        expect(rounded?.versionMatches).toBe(false);
      });
    });

    it("means the same moment however the token is written", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const person = await makeUser(tx, language);
        await tx.execute(
          sql`update users set updated_at = timestamptz '2026-03-01 12:00:00.250000+00' where id = ${person.id}`,
        );

        for (const token of [
          "2026-03-01T12:00:00.250000Z",
          "2026-03-01T12:00:00.25Z",
          "2026-03-01T12:00:00.250Z",
        ]) {
          expect(
            (await getRoleChangeTarget(tx, person.id, token))?.versionMatches,
            token,
          ).toBe(true);
        }
      });
    });

    it("says what kind of account it is, so a sandbox persona or an unlinked row can be refused", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const owner = await makeUser(tx, language);
        const persona = await makeUser(tx, language, {
          clerkUserId: null,
          isSandbox: true,
          sandboxOwnerUserId: owner.id,
        });
        const unlinked = await makeUser(tx, language, { clerkUserId: null });
        const token = "2026-03-01T12:00:00.000000Z";

        expect(await getRoleChangeTarget(tx, persona.id, token)).toMatchObject({
          isSandbox: true,
          hasClerkIdentity: false,
        });
        expect(await getRoleChangeTarget(tx, unlinked.id, token)).toMatchObject(
          { isSandbox: false, hasClerkIdentity: false },
        );
        expect(await getRoleChangeTarget(tx, randomUUID(), token)).toBeNull();
      });
    });
  });

  describe("setUserRole", () => {
    it("sets the role and advances the version token, which then matches the row", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const t = tag();
        await makeUser(tx, language, { displayName: `${t} A`, role: "user" });
        const [before] = (await listAdminUsers(tx, { search: t, limit: 5 }))
          .items;

        // Postgres' `now()` is the transaction's start inside this test, so the
        // clock must move for the token to: set it back, as a real earlier edit.
        await tx.execute(
          sql`update users set updated_at = updated_at - interval '1 minute' where id = ${before!.id}`,
        );
        const stale = (await listAdminUsers(tx, { search: t, limit: 5 }))
          .items[0]!;

        const result = await setUserRole(tx, before!.id, "writer");

        expect(result.role).toBe("writer");
        expect(result.updatedAt).not.toBe(stale.updatedAt);
        const target = await getRoleChangeTarget(
          tx,
          before!.id,
          result.updatedAt,
        );
        expect(target).toMatchObject({ role: "writer", versionMatches: true });
        // And the token the caller *held* is now stale.
        expect(
          (await getRoleChangeTarget(tx, before!.id, stale.updatedAt))
            ?.versionMatches,
        ).toBe(false);
      });
    });

    it.each(USER_ROLES)("can set the %s role", async (role) => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const person = await makeUser(tx, language, {
          role: role === "user" ? "admin" : "user",
        });
        expect((await setUserRole(tx, person.id, role)).role).toBe(role);
        expect(await getUserRole(tx, person.id)).toBe(role);
      });
    });

    it("changes nothing but the role and its version token", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const person = await makeUser(tx, language, {
          displayName: `${tag()} Sam`,
          username: `u_${tag()}`,
        });
        const [before] = await tx
          .select()
          .from(users)
          .where(eq(users.id, person.id));

        await setUserRole(tx, person.id, "writer");

        const [after] = await tx
          .select()
          .from(users)
          .where(eq(users.id, person.id));
        expect(withoutRoleAndVersion(after!)).toEqual(
          withoutRoleAndVersion(before!),
        );
        expect(after!.role).toBe("writer");
      });
    });
  });

  describe("countRealAdmins", () => {
    it("counts real Admin accounts, and not a sandbox persona or an unlinked row that merely carries the role", async () => {
      await withTestTransaction(async (tx) => {
        const language = await languageId(tx);
        const baseline = await countRealAdmins(tx);

        const owner = await makeUser(tx, language, { role: "admin" });
        await makeUser(tx, language, { role: "admin" });
        await makeUser(tx, language, { role: "writer" });
        await makeUser(tx, language, {
          role: "admin",
          clerkUserId: null,
          isSandbox: true,
          sandboxOwnerUserId: owner.id,
        });
        await makeUser(tx, language, { role: "admin", clerkUserId: null });
        // A persona row that carries a Clerk id anyway is still not a real Admin.
        await makeUser(tx, language, {
          role: "admin",
          clerkUserId: `clerk-odd-${randomUUID()}`,
          isSandbox: true,
          sandboxOwnerUserId: owner.id,
        });

        expect(await countRealAdmins(tx)).toBe(baseline + 2);
      });
    });
  });
});
