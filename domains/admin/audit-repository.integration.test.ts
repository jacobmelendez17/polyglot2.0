import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { AdminError } from "@/lib/errors/admin-errors";

import { getAuditEvents, recordAuditEvent } from "./audit-repository";
import type { RecordAuditEventInput } from "./audit-types";

function eventInput(
  overrides: Partial<RecordAuditEventInput> &
    Pick<RecordAuditEventInput, "actorUserId">,
): RecordAuditEventInput {
  return {
    action: "CURRICULUM_ITEM_CREATED",
    resourceType: "learning_item",
    resourceId: "gato",
    ...overrides,
  };
}

describe("admin audit event persistence", () => {
  it("persists an audit event and reads it back with before/after metadata intact", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);

      const inserted = await recordAuditEvent(
        tx,
        eventInput({
          actorUserId: developerId,
          action: "CURRICULUM_ITEM_MOVED",
          beforeData: { level: 2 },
          afterData: { level: 3 },
          reason: "Better thematic fit",
        }),
      );

      expect(inserted.action).toBe("CURRICULUM_ITEM_MOVED");
      expect(inserted.beforeData).toEqual({ level: 2 });
      expect(inserted.afterData).toEqual({ level: 3 });
      expect(inserted.reason).toBe("Better thematic fit");
      expect(inserted.correlationId).toBeNull();

      const page = await getAuditEvents(tx, { limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe(inserted.id);
      expect(page.nextCursor).toBeNull();
    });
  });

  it("filters by actor", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId, learnerId } = await seedTestFixtures(tx);
      await recordAuditEvent(tx, eventInput({ actorUserId: developerId }));
      await recordAuditEvent(tx, eventInput({ actorUserId: learnerId }));

      const page = await getAuditEvents(tx, {
        actorUserId: developerId,
        limit: 10,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.actorUserId).toBe(developerId);
    });
  });

  it("filters by action type", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await recordAuditEvent(
        tx,
        eventInput({
          actorUserId: developerId,
          action: "CURRICULUM_ITEM_CREATED",
        }),
      );
      await recordAuditEvent(
        tx,
        eventInput({
          actorUserId: developerId,
          action: "CURRICULUM_ITEM_ARCHIVED",
        }),
      );

      const page = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_ARCHIVED",
        limit: 10,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.action).toBe("CURRICULUM_ITEM_ARCHIVED");
    });
  });

  it("filters by resource type and resource id together", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await recordAuditEvent(
        tx,
        eventInput({
          actorUserId: developerId,
          resourceType: "learning_item",
          resourceId: "gato",
        }),
      );
      await recordAuditEvent(
        tx,
        eventInput({
          actorUserId: developerId,
          resourceType: "learning_item",
          resourceId: "perro",
        }),
      );
      await recordAuditEvent(
        tx,
        eventInput({
          actorUserId: developerId,
          resourceType: "level",
          resourceId: "gato",
        }),
      );

      const page = await getAuditEvents(tx, {
        resourceType: "learning_item",
        resourceId: "gato",
        limit: 10,
      });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.resourceType).toBe("learning_item");
      expect(page.items[0]?.resourceId).toBe("gato");
    });
  });

  it("filters by a date range", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      const inRange = await recordAuditEvent(
        tx,
        eventInput({ actorUserId: developerId }),
      );

      const page = await getAuditEvents(tx, {
        from: new Date(Date.now() - 60_000),
        to: new Date(Date.now() + 60_000),
        limit: 10,
      });
      expect(page.items.map((e) => e.id)).toContain(inRange.id);

      const outOfRange = await getAuditEvents(tx, {
        from: new Date("2000-01-01T00:00:00Z"),
        to: new Date("2000-01-02T00:00:00Z"),
        limit: 10,
      });
      expect(outOfRange.items).toHaveLength(0);
    });
  });

  it("orders newest first and paginates via keyset cursor without gaps or duplicates", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);

      // Explicit, distinct `createdAt` values — Postgres's unqualified
      // `now()` returns the transaction-start time for every statement in
      // this shared test transaction, so relying on the default would give
      // all 5 rows the identical timestamp and make ordering among them
      // fall to a random UUID tiebreak instead of insertion order.
      const inserted = [];
      for (let i = 0; i < 5; i++) {
        inserted.push(
          await recordAuditEvent(
            tx,
            eventInput({
              actorUserId: developerId,
              resourceId: `item-${i}`,
              createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
            }),
          ),
        );
      }
      const expectedNewestFirstIds = [...inserted].reverse().map((e) => e.id);

      const firstPage = await getAuditEvents(tx, { limit: 2 });
      expect(firstPage.items.map((e) => e.id)).toEqual(
        expectedNewestFirstIds.slice(0, 2),
      );
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await getAuditEvents(tx, {
        limit: 2,
        cursor: firstPage.nextCursor,
      });
      expect(secondPage.items.map((e) => e.id)).toEqual(
        expectedNewestFirstIds.slice(2, 4),
      );

      const thirdPage = await getAuditEvents(tx, {
        limit: 2,
        cursor: secondPage.nextCursor,
      });
      expect(thirdPage.items.map((e) => e.id)).toEqual(
        expectedNewestFirstIds.slice(4, 5),
      );
      expect(thirdPage.nextCursor).toBeNull();
    });
  });

  it("rejects recording an event for an unknown action at the repository boundary", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await expect(
        recordAuditEvent(tx, {
          actorUserId: developerId,
          // @ts-expect-error deliberately invalid — proving the Zod boundary catches it, not just TypeScript
          action: "NOT_A_REAL_ACTION",
          resourceType: "learning_item",
        }),
      ).rejects.toThrow();
    });
  });
});

describe("audit log paging is exact — nothing is skipped or repeated, in either direction", () => {
  /**
   * Events recorded in one transaction all carry that transaction's `now()` — one
   * instant, to the microsecond — which is how a bulk publish or an import's
   * commit writes its events. JavaScript's `Date` keeps milliseconds only, so a
   * cursor that went through one rounded the instant and skipped the rest of the
   * group whenever a page ended inside it.
   */
  async function recordGroup(
    tx: Parameters<typeof recordAuditEvent>[0],
    actorUserId: string,
    count: number,
    overrides: Partial<RecordAuditEventInput> = {},
  ) {
    const ids: string[] = [];
    for (let n = 0; n < count; n++) {
      const event = await recordAuditEvent(
        tx,
        eventInput({ actorUserId, resourceId: `group-${n}`, ...overrides }),
      );
      ids.push(event.id);
    }
    return ids;
  }

  async function allPages(
    tx: Parameters<typeof getAuditEvents>[0],
    limit: number,
    filters: Partial<Parameters<typeof getAuditEvents>[1]> = {},
  ) {
    const pages = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof getAuditEvents>> =
        await getAuditEvents(tx, { limit, cursor, ...filters });
      pages.push(page);
      cursor = page.nextCursor;
      // A cursor that does not advance must fail the test, not hang the run.
      if (pages.length > 50)
        throw new Error("the cursor never reached the end");
    } while (cursor);
    return pages;
  }

  it("keeps every event of a group that shares one instant, wherever a page ends", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      const recorded = await recordGroup(tx, developerId, 7);

      for (const limit of [1, 2, 3, 4, 6, 7, 8]) {
        const pages = await allPages(tx, limit);
        const seen = pages.flatMap((page) => page.items.map((e) => e.id));
        expect(seen, `page size ${limit}`).toHaveLength(7);
        expect(new Set(seen), `page size ${limit}`).toEqual(new Set(recorded));
      }
    });
  });

  it("orders events of one instant by id, newest first, the same on every page size", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      const recorded = await recordGroup(tx, developerId, 5);
      const expected = [...recorded].sort().reverse();

      for (const limit of [2, 5]) {
        const pages = await allPages(tx, limit);
        expect(
          pages.flatMap((page) => page.items.map((e) => e.id)),
          `page size ${limit}`,
        ).toEqual(expected);
      }
    });
  });

  it("walks back by the previous cursor to exactly the page it came from", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await recordGroup(tx, developerId, 7);

      const forward = await allPages(tx, 3); // 3 + 3 + 1
      expect(forward.map((page) => page.items.length)).toEqual([3, 3, 1]);

      // From the third page back to the second, and from there to the first.
      const third = forward[2]!;
      expect(third.hasPreviousPage).toBe(true);
      const second = await getAuditEvents(tx, {
        limit: 3,
        cursor: third.previousCursor,
      });
      expect(second.items.map((e) => e.id)).toEqual(
        forward[1]!.items.map((e) => e.id),
      );
      expect(second.hasPreviousPage).toBe(true);

      const first = await getAuditEvents(tx, {
        limit: 3,
        cursor: second.previousCursor,
      });
      expect(first.items.map((e) => e.id)).toEqual(
        forward[0]!.items.map((e) => e.id),
      );
    });
  });

  it("says the previous page of the second page is the first — which needs no cursor — and the first has none", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await recordGroup(tx, developerId, 5);

      const first = await getAuditEvents(tx, { limit: 2 });
      expect(first.hasPreviousPage).toBe(false);
      expect(first.previousCursor).toBeNull();

      const second = await getAuditEvents(tx, {
        limit: 2,
        cursor: first.nextCursor,
      });
      // There is a previous page — and it is the first, so it has no cursor.
      expect(second.hasPreviousPage).toBe(true);
      expect(second.previousCursor).toBeNull();
      const back = await getAuditEvents(tx, { limit: 2 });
      expect(back.items.map((e) => e.id)).toEqual(first.items.map((e) => e.id));
    });
  });

  it("pages and walks back through the filters, not through everything", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId, learnerId } = await seedTestFixtures(tx);
      // Nine events at nine known instants, alternating: odd seconds are the ones
      // asked for, even seconds are not. Explicit instants, so where each page
      // ends is fixed by the data and not by the order random ids happen to fall
      // in — a previous page worked out over *everything* then lands elsewhere.
      const at = (second: number) =>
        new Date(Date.UTC(2026, 0, 1, 0, 0, second));
      for (let second = 1; second <= 9; second++) {
        await recordAuditEvent(
          tx,
          eventInput({
            actorUserId: second % 2 === 1 ? developerId : learnerId,
            action: second % 2 === 1 ? "GROUP_CREATED" : "LEVEL_CREATED",
            resourceId: `second-${second}`,
            createdAt: at(second),
          }),
        );
      }
      const mine = {
        actorUserId: developerId,
        action: "GROUP_CREATED",
      } as const;

      const pages = await allPages(tx, 2, mine);
      expect(pages.map((page) => page.items.map((e) => e.resourceId))).toEqual([
        ["second-9", "second-7"],
        ["second-5", "second-3"],
        ["second-1"],
      ]);

      // Back from the last page is the page before it — *within the filters*.
      const last = pages[2]!;
      expect(last.hasPreviousPage).toBe(true);
      const before = await getAuditEvents(tx, {
        limit: 2,
        ...mine,
        cursor: last.previousCursor,
      });
      expect(before.items.map((e) => e.resourceId)).toEqual([
        "second-5",
        "second-3",
      ]);
      // …and from there, the first page, which needs no cursor.
      const first = await getAuditEvents(tx, {
        limit: 2,
        ...mine,
        cursor: before.previousCursor,
      });
      expect(first.items.map((e) => e.resourceId)).toEqual([
        "second-9",
        "second-7",
      ]);
      expect(before.previousCursor).toBeNull();
      expect(before.hasPreviousPage).toBe(true);
    });
  });

  it("has nothing before an empty log's first page, and nothing after it", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const page = await getAuditEvents(tx, { limit: 5 });
      expect(page).toEqual({
        items: [],
        nextCursor: null,
        hasPreviousPage: false,
        previousCursor: null,
      });
    });
  });

  it.each([
    ["not a cursor at all", "garbage"],
    ["base64 that is not JSON", Buffer.from("{nope").toString("base64url")],
    ["JSON of the wrong shape", Buffer.from("[1,2]").toString("base64url")],
    [
      "the old cursor, whose time had only milliseconds",
      Buffer.from(
        JSON.stringify({
          createdAt: "2026-10-14T22:46:21.710Z",
          id: "e0000000-0000-4000-8000-000000000001",
        }),
      ).toString("base64url"),
    ],
    [
      "an id that is not an id",
      Buffer.from(
        JSON.stringify({ c: "2026-10-14T22:46:21.710123Z", i: "x" }),
      ).toString("base64url"),
    ],
    [
      "a time that is not a time",
      Buffer.from(
        JSON.stringify({
          c: "yesterday",
          i: "e0000000-0000-4000-8000-000000000001",
        }),
      ).toString("base64url"),
    ],
  ])("refuses %s in plain words", async (_name, cursor) => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const refusal = getAuditEvents(tx, { limit: 5, cursor });
      await expect(refusal).rejects.toBeInstanceOf(AdminError);
      await expect(refusal).rejects.toMatchObject({
        code: "CURRICULUM_VALIDATION_FAILED",
        message: "That page link is not valid. Go back to the first page.",
      });
    });
  });
});
