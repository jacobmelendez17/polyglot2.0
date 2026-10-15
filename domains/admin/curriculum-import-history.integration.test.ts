import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { curriculumImports, languages } from "@/db/schema";
import {
  withTestTransaction,
  type TestTx,
} from "@/db/test/with-test-transaction";

import {
  listArchivedCurriculumImports,
  listCurriculumImports,
} from "./curriculum-import-repository";

/**
 * Spec 26 Unit 8: the import history is read a page at a time, in both
 * directions, from a cursor alone. The tests build the awkward histories —
 * many imports sharing one instant (a single statement makes them), instants
 * that differ only below a millisecond — because that is where a cursor that
 * rounds its timestamp silently skips rows.
 */

type Seed = { id: string; createdAt?: string; archived?: boolean };

/** Inserts one import per seed. `createdAt` is raw SQL text, so a test can set microseconds; none means "now" (shared by every row of the statement). */
async function seedImports(
  tx: TestTx,
  languageId: string,
  seeds: Seed[],
): Promise<void> {
  await tx.insert(curriculumImports).values(
    seeds.map((seed) => ({
      id: seed.id,
      environment: "development",
      languageId,
      originalFilename: `history-${seed.id.slice(0, 8)}.csv`,
      fileExtension: "csv",
      s3Bucket: "polyglot-dev-imports",
      s3Key: `imports/${seed.id}/source.csv`,
      uploadedByUserId: DEVELOPER_ID,
      ...(seed.createdAt
        ? { createdAt: sql`${seed.createdAt}::timestamptz` }
        : {}),
      ...(seed.archived ? { archivedAt: sql`now()` } : {}),
    })),
  );
}

/** The ids of a language's history in the order the list promises: newest first, ties by id, read straight from the table. */
async function expectedOrder(
  tx: TestTx,
  languageId: string,
  archived: boolean,
): Promise<string[]> {
  const result = await tx.execute(
    sql`select id from curriculum_imports
        where language_id = ${languageId}
          and archived_at is ${archived ? sql`not null` : sql`null`}
        order by created_at desc, id desc`,
  );
  return result.rows.map((row) => (row as { id: string }).id);
}

type List = typeof listCurriculumImports;

async function walkForwards(
  list: List,
  tx: TestTx,
  languageId: string,
  limit: number,
) {
  const pages: {
    ids: string[];
    nextCursor: string | null;
    hasPreviousPage: boolean;
    previousCursor: string | null;
    cursor: string | undefined;
  }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list(tx, { languageId, limit, cursor });
    pages.push({
      ids: page.items.map((item) => item.id),
      nextCursor: page.nextCursor,
      hasPreviousPage: page.hasPreviousPage,
      previousCursor: page.previousCursor,
      cursor,
    });
    cursor = page.nextCursor ?? undefined;
    // A cursor that does not move forward would never end — fail, don't hang.
    if (pages.length > 200) {
      throw new Error(`the cursor never reached the end (limit ${limit})`);
    }
  } while (cursor);
  return pages;
}

/** Ids spread over three groups: 12 sharing one instant, 6 within one millisecond but microseconds apart, 4 older. */
function awkwardHistory(): Seed[] {
  const sameInstant = Array.from({ length: 12 }, () => ({ id: randomUUID() }));
  const sameMillisecond = Array.from({ length: 6 }, (_, index) => ({
    id: randomUUID(),
    createdAt: `2026-01-02 03:04:05.12${index + 1}456+00`,
  }));
  const older = Array.from({ length: 4 }, (_, index) => ({
    id: randomUUID(),
    createdAt: `2025-12-0${index + 1} 10:00:00+00`,
  }));
  return [...sameInstant, ...sameMillisecond, ...older];
}

describe("import history paging (spec 26 Unit 8)", () => {
  it("walks forwards through a history that shares instants without skipping or repeating a row", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedImports(tx, languageId, awkwardHistory());
      const expected = await expectedOrder(tx, languageId, false);
      expect(expected).toHaveLength(22);

      for (const limit of [1, 5, 7, 22, 50]) {
        const pages = await walkForwards(
          listCurriculumImports,
          tx,
          languageId,
          limit,
        );
        expect(
          pages.flatMap((page) => page.ids),
          `limit ${limit}`,
        ).toEqual(expected);
        // Only the last page has no next page, and only the first no previous.
        expect(pages.at(-1)!.nextCursor).toBeNull();
        expect(pages[0]!.hasPreviousPage).toBe(false);
        for (const page of pages.slice(1)) {
          expect(page.hasPreviousPage).toBe(true);
        }
      }
    });
  });

  it("walks backwards from any page to the same pages, from the cursor alone", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedImports(tx, languageId, awkwardHistory());
      const forwards = await walkForwards(
        listCurriculumImports,
        tx,
        languageId,
        7,
      );
      expect(forwards).toHaveLength(4);

      // From the last page, follow `previousCursor` back to the first, each
      // time asking for the page with nothing but the cursor it was handed.
      let page = forwards.at(-1)!;
      for (let index = forwards.length - 2; index >= 0; index--) {
        const previous = await listCurriculumImports(tx, {
          languageId,
          limit: 7,
          cursor: page.previousCursor ?? undefined,
        });
        expect(previous.items.map((item) => item.id)).toEqual(
          forwards[index]!.ids,
        );
        page = {
          ids: previous.items.map((item) => item.id),
          nextCursor: previous.nextCursor,
          hasPreviousPage: previous.hasPreviousPage,
          previousCursor: previous.previousCursor,
          cursor: page.previousCursor ?? undefined,
        };
      }
      // The first page has no cursor, but the page after it knows it exists.
      expect(forwards[1]!.hasPreviousPage).toBe(true);
      expect(forwards[1]!.previousCursor).toBeNull();
    });
  });

  it("tells a page that fills exactly from one with more behind it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedImports(
        tx,
        languageId,
        Array.from({ length: 6 }, () => ({ id: randomUUID() })),
      );

      const exact = await listCurriculumImports(tx, { languageId, limit: 6 });
      expect(exact.items).toHaveLength(6);
      expect(exact.nextCursor).toBeNull();

      const short = await listCurriculumImports(tx, { languageId, limit: 5 });
      expect(short.items).toHaveLength(5);
      expect(short.nextCursor).not.toBeNull();
    });
  });

  it("finds the right neighbours when the row a cursor names has been deleted", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedImports(tx, languageId, awkwardHistory());
      const first = await listCurriculumImports(tx, { languageId, limit: 5 });
      const lastOfFirst = first.items.at(-1)!;
      const second = await listCurriculumImports(tx, {
        languageId,
        limit: 5,
        cursor: first.nextCursor!,
      });

      await tx
        .delete(curriculumImports)
        .where(eq(curriculumImports.id, lastOfFirst.id));

      // The second page is the same rows: the cursor is a position, not a row.
      const again = await listCurriculumImports(tx, {
        languageId,
        limit: 5,
        cursor: first.nextCursor!,
      });
      expect(again.items.map((item) => item.id)).toEqual(
        second.items.map((item) => item.id),
      );
      // …and Previous still leads back to everything that came before it. The
      // boundary row is gone, so the page may reach one row further than it
      // did — never short of a row that precedes the current page.
      const back = await listCurriculumImports(tx, {
        languageId,
        limit: 5,
        cursor: again.previousCursor ?? undefined,
      });
      expect(back.items.map((item) => item.id).slice(0, 4)).toEqual(
        first.items.slice(0, 4).map((item) => item.id),
      );
      expect(back.hasPreviousPage).toBe(false);
    });
  });

  it("keeps the normal and archived histories, and the languages, apart", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const [otherLanguage] = await tx
        .insert(languages)
        .values({
          code: `h-${randomUUID().slice(0, 8)}`,
          slug: `h-${randomUUID().slice(0, 8)}`,
          name: "Another language",
        })
        .returning({ id: languages.id });

      const active = [randomUUID(), randomUUID(), randomUUID()];
      const archived = [randomUUID(), randomUUID()];
      const elsewhere = randomUUID();
      await seedImports(tx, languageId, [
        ...active.map((id) => ({ id })),
        ...archived.map((id) => ({ id, archived: true })),
      ]);
      await seedImports(tx, otherLanguage!.id, [{ id: elsewhere }]);

      const normal = await listCurriculumImports(tx, { languageId, limit: 20 });
      const old = await listArchivedCurriculumImports(tx, {
        languageId,
        limit: 20,
      });

      expect(normal.items.map((item) => item.id).sort()).toEqual(
        [...active].sort(),
      );
      expect(old.items.map((item) => item.id).sort()).toEqual(
        [...archived].sort(),
      );
      expect(old.items.every((item) => item.archivedAt !== null)).toBe(true);
      expect(normal.items.every((item) => item.archivedAt === null)).toBe(true);
      expect(
        [...normal.items, ...old.items].some((item) => item.id === elsewhere),
      ).toBe(false);
    });
  });

  it("reads the history of each state by the same ordering, archived included", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await seedImports(
        tx,
        languageId,
        Array.from({ length: 9 }, () => ({ id: randomUUID(), archived: true })),
      );
      const expected = await expectedOrder(tx, languageId, true);

      const pages = await walkForwards(
        listArchivedCurriculumImports,
        tx,
        languageId,
        4,
      );

      expect(pages.flatMap((page) => page.ids)).toEqual(expected);
    });
  });

  it.each([
    ["not base64 JSON", "%%%not-a-cursor%%%"],
    ["JSON that is not an object", Buffer.from("[]").toString("base64url")],
    [
      "a cursor in the old millisecond shape",
      Buffer.from(
        JSON.stringify({
          createdAt: "2026-01-02T03:04:05.123Z",
          id: randomUUID(),
        }),
      ).toString("base64url"),
    ],
    [
      "an instant that is not microsecond text",
      Buffer.from(
        JSON.stringify({ c: "2026-01-02T03:04:05.123Z", i: randomUUID() }),
      ).toString("base64url"),
    ],
    [
      "an id that is not a UUID",
      Buffer.from(
        JSON.stringify({ c: "2026-01-02T03:04:05.123456Z", i: "x" }),
      ).toString("base64url"),
    ],
  ])("refuses a cursor that is %s, in words", async (_name, cursor) => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await expect(
        listCurriculumImports(tx, { languageId, limit: 5, cursor }),
      ).rejects.toMatchObject({
        code: "CURRICULUM_VALIDATION_FAILED",
        message: "That page link is not valid. Go back to the first page.",
      });
    });
  });
});
