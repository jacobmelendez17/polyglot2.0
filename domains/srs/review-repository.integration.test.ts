import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getReviewHistory, getReviewTimestampsInWindow, insertReviewEvent } from "./review-repository";
import type { InsertReviewEventInput } from "./review-history-types";

function eventInput(overrides: Partial<InsertReviewEventInput> & Pick<InsertReviewEventInput, "userId" | "languageId" | "learningItemId">): InsertReviewEventInput {
  return {
    reviewedAt: new Date("2026-01-01T00:00:00Z"),
    stageBefore: "beginner_1",
    stageAfter: "beginner_2",
    requiredQuestionCount: 2,
    incorrectAdjustmentCount: 0,
    result: "advanced",
    ...overrides,
  };
}

describe("review event persistence", () => {
  it("persists a review event and reads it back with no raw answer content", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);

      const inserted = await insertReviewEvent(
        tx,
        eventInput({ userId: learnerId, languageId, learningItemId: gatoId }),
      );

      expect(inserted.stageBefore).toBe("beginner_1");
      expect(inserted.stageAfter).toBe("beginner_2");
      expect(inserted.result).toBe("advanced");
      // The row shape has no field capable of holding a typed answer/transcript.
      expect(Object.keys(inserted).sort()).toEqual(
        [
          "id",
          "userId",
          "languageId",
          "learningItemId",
          "reviewedAt",
          "stageBefore",
          "stageAfter",
          "requiredQuestionCount",
          "incorrectAdjustmentCount",
          "result",
          "createdAt",
        ].sort(),
      );

      const page = await getReviewHistory(tx, { userId: learnerId, languageId, limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.id).toBe(inserted.id);
      expect(page.nextCursor).toBeNull();
    });
  });

  it("keeps review history for User A separate from User B", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, gatoId, languageId } = await seedTestFixtures(tx);
      await insertReviewEvent(tx, eventInput({ userId: learnerId, languageId, learningItemId: gatoId }));
      await insertReviewEvent(tx, eventInput({ userId: developerId, languageId, learningItemId: gatoId }));

      const page = await getReviewHistory(tx, { userId: learnerId, languageId, limit: 10 });
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.userId).toBe(learnerId);
    });
  });

  it("orders newest first and paginates via keyset cursor without gaps or duplicates", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, casaId, aguaId, languageId } = await seedTestFixtures(tx);
      const items = [gatoId, casaId, aguaId];

      // Five events, one second apart, spread across the three fixture items.
      const inserted = [];
      for (let i = 0; i < 5; i++) {
        inserted.push(
          await insertReviewEvent(
            tx,
            eventInput({
              userId: learnerId,
              languageId,
              learningItemId: items[i % items.length]!,
              reviewedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
            }),
          ),
        );
      }
      const expectedNewestFirstIds = [...inserted].reverse().map((e) => e.id);

      const firstPage = await getReviewHistory(tx, { userId: learnerId, languageId, limit: 2 });
      expect(firstPage.items.map((e) => e.id)).toEqual(expectedNewestFirstIds.slice(0, 2));
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await getReviewHistory(tx, {
        userId: learnerId,
        languageId,
        limit: 2,
        cursor: firstPage.nextCursor,
      });
      expect(secondPage.items.map((e) => e.id)).toEqual(expectedNewestFirstIds.slice(2, 4));

      const thirdPage = await getReviewHistory(tx, {
        userId: learnerId,
        languageId,
        limit: 2,
        cursor: secondPage.nextCursor,
      });
      expect(thirdPage.items.map((e) => e.id)).toEqual(expectedNewestFirstIds.slice(4, 5));
      expect(thirdPage.nextCursor).toBeNull();
    });
  });
});

describe("getReviewTimestampsInWindow", () => {
  it("returns only timestamps within [since, until) for the given user/language, unpaginated", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);

      const inWindow1 = new Date("2026-02-10T00:00:00Z");
      const inWindow2 = new Date("2026-02-15T00:00:00Z");
      const beforeWindow = new Date("2026-01-01T00:00:00Z");
      const atUntilBoundary = new Date("2026-03-01T00:00:00Z"); // excluded: until is exclusive

      for (const reviewedAt of [inWindow1, inWindow2, beforeWindow, atUntilBoundary]) {
        await insertReviewEvent(tx, eventInput({ userId: learnerId, languageId, learningItemId: gatoId, reviewedAt }));
      }

      const timestamps = await getReviewTimestampsInWindow(tx, learnerId, languageId, {
        since: new Date("2026-02-01T00:00:00Z"),
        until: atUntilBoundary,
      });

      expect(timestamps).toEqual(expect.arrayContaining([inWindow1, inWindow2]));
      expect(timestamps).toHaveLength(2);
    });
  });

  it("never returns another user's or another language's review timestamps", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, gatoId } = await seedTestFixtures(tx);
      const reviewedAt = new Date("2026-02-10T00:00:00Z");

      await insertReviewEvent(tx, eventInput({ userId: learnerId, languageId, learningItemId: gatoId, reviewedAt }));
      await insertReviewEvent(tx, eventInput({ userId: developerId, languageId, learningItemId: gatoId, reviewedAt }));

      const timestamps = await getReviewTimestampsInWindow(tx, learnerId, languageId, {
        since: new Date("2026-02-01T00:00:00Z"),
        until: new Date("2026-03-01T00:00:00Z"),
      });

      expect(timestamps).toHaveLength(1);
    });
  });
});
