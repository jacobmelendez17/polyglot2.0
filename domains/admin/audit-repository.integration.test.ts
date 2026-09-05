import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getAuditEvents, recordAuditEvent } from "./audit-repository";
import type { RecordAuditEventInput } from "./audit-types";

function eventInput(
  overrides: Partial<RecordAuditEventInput> & Pick<RecordAuditEventInput, "actorUserId">,
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

      const page = await getAuditEvents(tx, { actorUserId: developerId, limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.actorUserId).toBe(developerId);
    });
  });

  it("filters by action type", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await recordAuditEvent(tx, eventInput({ actorUserId: developerId, action: "CURRICULUM_ITEM_CREATED" }));
      await recordAuditEvent(tx, eventInput({ actorUserId: developerId, action: "CURRICULUM_ITEM_ARCHIVED" }));

      const page = await getAuditEvents(tx, { action: "CURRICULUM_ITEM_ARCHIVED", limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.action).toBe("CURRICULUM_ITEM_ARCHIVED");
    });
  });

  it("filters by resource type and resource id together", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      await recordAuditEvent(tx, eventInput({ actorUserId: developerId, resourceType: "learning_item", resourceId: "gato" }));
      await recordAuditEvent(tx, eventInput({ actorUserId: developerId, resourceType: "learning_item", resourceId: "perro" }));
      await recordAuditEvent(tx, eventInput({ actorUserId: developerId, resourceType: "level", resourceId: "gato" }));

      const page = await getAuditEvents(tx, { resourceType: "learning_item", resourceId: "gato", limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.resourceType).toBe("learning_item");
      expect(page.items[0]?.resourceId).toBe("gato");
    });
  });

  it("filters by a date range", async () => {
    await withTestTransaction(async (tx) => {
      const { developerId } = await seedTestFixtures(tx);
      const inRange = await recordAuditEvent(tx, eventInput({ actorUserId: developerId }));

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
      expect(firstPage.items.map((e) => e.id)).toEqual(expectedNewestFirstIds.slice(0, 2));
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await getAuditEvents(tx, { limit: 2, cursor: firstPage.nextCursor });
      expect(secondPage.items.map((e) => e.id)).toEqual(expectedNewestFirstIds.slice(2, 4));

      const thirdPage = await getAuditEvents(tx, { limit: 2, cursor: secondPage.nextCursor });
      expect(thirdPage.items.map((e) => e.id)).toEqual(expectedNewestFirstIds.slice(4, 5));
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
