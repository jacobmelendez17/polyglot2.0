import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { userSentenceGhostProgress } from "@/db/schema";
import {
  SENTENCE_GATO_ID,
  SENTENCE_Y_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import {
  applyGhostAnswer,
  applyGhostVacationSchedulingAdjustment,
  deleteGhostProgressForContentType,
  deleteGhostProgressForLearningItems,
  getDueGhosts,
  recordSentenceMiss,
} from "./ghost-repository";

const NOW = new Date("2026-01-01T00:00:00Z");

async function findGhostRow(
  tx: Parameters<typeof recordSentenceMiss>[0],
  userId: string,
  learningItemId: string,
  sentenceId: string,
) {
  const [row] = await tx
    .select()
    .from(userSentenceGhostProgress)
    .where(
      and(
        eq(userSentenceGhostProgress.userId, userId),
        eq(userSentenceGhostProgress.learningItemId, learningItemId),
        eq(userSentenceGhostProgress.sentenceId, sentenceId),
      ),
    );
  return row;
}

describe("recordSentenceMiss (spec 20 Ghost Reviews)", () => {
  it("Off never creates a row at all", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "off",
        now: NOW,
      });
      expect(
        await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID),
      ).toBeUndefined();
    });
  });

  it("On activates a Ghost on the very first miss", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: NOW,
      });
      const row = await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID);
      expect(row).toMatchObject({
        missCount: 1,
        ghostStage: "ghost_1",
        nextReviewAt: new Date("2026-01-01T04:00:00Z"),
        activatedAt: NOW,
        completedAt: null,
        contentType: "vocabulary",
      });
    });
  });

  it("Minimal only activates after the second miss of the same sentence", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, grammarYId } = await seedTestFixtures(tx);
      const input = {
        userId: learnerId,
        languageId,
        learningItemId: grammarYId,
        sentenceId: SENTENCE_Y_ID,
        contentType: "grammar" as const,
        mode: "minimal" as const,
      };

      await recordSentenceMiss(tx, { ...input, now: NOW });
      const afterFirst = await findGhostRow(
        tx,
        learnerId,
        grammarYId,
        SENTENCE_Y_ID,
      );
      expect(afterFirst).toMatchObject({
        missCount: 1,
        ghostStage: null,
        activatedAt: null,
      });

      const secondMissAt = new Date("2026-01-02T00:00:00Z");
      await recordSentenceMiss(tx, { ...input, now: secondMissAt });
      const afterSecond = await findGhostRow(
        tx,
        learnerId,
        grammarYId,
        SENTENCE_Y_ID,
      );
      expect(afterSecond).toMatchObject({
        missCount: 2,
        ghostStage: "ghost_1",
        nextReviewAt: new Date("2026-01-02T04:00:00Z"),
        activatedAt: secondMissAt,
      });
    });
  });

  it("a further miss of an already-active Ghost is a no-op — the row is untouched", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const input = {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary" as const,
        mode: "on" as const,
      };

      await recordSentenceMiss(tx, { ...input, now: NOW });
      const afterFirst = await findGhostRow(
        tx,
        learnerId,
        gatoId,
        SENTENCE_GATO_ID,
      );

      await recordSentenceMiss(tx, {
        ...input,
        now: new Date("2026-06-01T00:00:00Z"),
      });
      const afterSecond = await findGhostRow(
        tx,
        learnerId,
        gatoId,
        SENTENCE_GATO_ID,
      );

      expect(afterSecond).toEqual(afterFirst);
    });
  });
});

describe("applyGhostAnswer (spec 20 Ghost SRS / Incorrect Ghost Answer)", () => {
  async function activateGhost(
    tx: Parameters<typeof recordSentenceMiss>[0],
    userId: string,
    languageId: string,
    learningItemId: string,
    sentenceId: string,
  ) {
    await recordSentenceMiss(tx, {
      userId,
      languageId,
      learningItemId,
      sentenceId,
      contentType: "vocabulary",
      mode: "on",
      now: NOW,
    });
    const row = await findGhostRow(tx, userId, learningItemId, sentenceId);
    return row!;
  }

  it("a correct answer advances one Ghost stage and reschedules per the fixed Ghost SRS", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const ghost = await activateGhost(
        tx,
        learnerId,
        languageId,
        gatoId,
        SENTENCE_GATO_ID,
      );

      const result = await applyGhostAnswer(tx, {
        userId: learnerId,
        ghostProgressId: ghost.id,
        isCorrect: true,
        now: new Date("2026-01-01T04:00:00Z"),
      });

      expect(result).toMatchObject({
        kind: "continuing",
        ghostProgress: {
          ghostStage: "ghost_2",
          nextReviewAt: new Date("2026-01-01T16:00:00Z"),
        },
      });
    });
  });

  it("a correct answer on Ghost 4 completes the Ghost — nextReviewAt null, completedAt set", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const ghost = await activateGhost(
        tx,
        learnerId,
        languageId,
        gatoId,
        SENTENCE_GATO_ID,
      );
      await tx
        .update(userSentenceGhostProgress)
        .set({ ghostStage: "ghost_4" })
        .where(eq(userSentenceGhostProgress.id, ghost.id));

      const completedAt = new Date("2026-03-01T00:00:00Z");
      const result = await applyGhostAnswer(tx, {
        userId: learnerId,
        ghostProgressId: ghost.id,
        isCorrect: true,
        now: completedAt,
      });

      expect(result).toMatchObject({
        kind: "completed",
        ghostProgress: {
          ghostStage: "ghost_4",
          nextReviewAt: null,
          completedAt,
        },
      });
    });
  });

  it("an incorrect answer resets to Ghost 1 regardless of which stage it was on", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const ghost = await activateGhost(
        tx,
        learnerId,
        languageId,
        gatoId,
        SENTENCE_GATO_ID,
      );
      await tx
        .update(userSentenceGhostProgress)
        .set({ ghostStage: "ghost_3" })
        .where(eq(userSentenceGhostProgress.id, ghost.id));

      const now = new Date("2026-02-01T00:00:00Z");
      const result = await applyGhostAnswer(tx, {
        userId: learnerId,
        ghostProgressId: ghost.id,
        isCorrect: false,
        now,
      });

      expect(result).toMatchObject({
        kind: "continuing",
        ghostProgress: {
          ghostStage: "ghost_1",
          nextReviewAt: new Date("2026-02-01T04:00:00Z"),
        },
      });
    });
  });

  it("returns null for a Ghost that does not belong to this user", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      const ghost = await activateGhost(
        tx,
        learnerId,
        languageId,
        gatoId,
        SENTENCE_GATO_ID,
      );

      const result = await applyGhostAnswer(tx, {
        userId: "00000000-0000-0000-0000-000000000099",
        ghostProgressId: ghost.id,
        isCorrect: true,
        now: NOW,
      });
      expect(result).toBeNull();
    });
  });
});

describe("getDueGhosts", () => {
  it("returns only Ghosts whose nextReviewAt has passed, excluding future and terminal (null) ones", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, grammarYId } =
        await seedTestFixtures(tx);
      const now = new Date("2026-01-01T00:00:00Z");

      // Due: activated well before now.
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      });
      // Not yet due: activated just now (4h out).
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: grammarYId,
        sentenceId: SENTENCE_Y_ID,
        contentType: "grammar",
        mode: "on",
        now,
      });

      const due = await getDueGhosts(tx, learnerId, languageId, now);
      expect(due).toHaveLength(1);
      expect(due[0]).toMatchObject({
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
      });
    });
  });
});

describe("applyGhostVacationSchedulingAdjustment (spec 20 Vacation and Ghosts)", () => {
  it("preserves the remaining interval across a vacation, the same rule as normal scheduled reviews", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      // Ghost 1 activated at 00:00, due at 04:00 (4h interval).
      const activatedAt = new Date("2026-01-01T00:00:00Z");
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: activatedAt,
      });

      // Vacation starts 1 hour in (3 hours remaining) and lasts 10 days.
      const vacationStartedAt = new Date("2026-01-01T01:00:00Z");
      const vacationEndedAt = new Date("2026-01-11T01:00:00Z");
      await applyGhostVacationSchedulingAdjustment(
        tx,
        learnerId,
        vacationStartedAt,
        vacationEndedAt,
      );

      const row = await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID);
      // 3 hours remaining, preserved past the vacation's end.
      expect(row?.nextReviewAt).toEqual(new Date("2026-01-11T04:00:00Z"));
    });
  });
});

describe("deleteGhostProgressForContentType (spec 20 Danger Zone — Ghost Reviews Reset)", () => {
  it("removes only Ghost state for the given content type, never the other", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, grammarYId } =
        await seedTestFixtures(tx);
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: NOW,
      });
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: grammarYId,
        sentenceId: SENTENCE_Y_ID,
        contentType: "grammar",
        mode: "on",
        now: NOW,
      });

      const removedCount = await deleteGhostProgressForContentType(
        tx,
        learnerId,
        languageId,
        "vocabulary",
      );

      expect(removedCount).toBe(1);
      expect(
        await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID),
      ).toBeUndefined();
      expect(
        await findGhostRow(tx, learnerId, grammarYId, SENTENCE_Y_ID),
      ).toBeDefined();
    });
  });

  it("returns 0 and deletes nothing when there is no Ghost state for that content type", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      expect(
        await deleteGhostProgressForContentType(
          tx,
          learnerId,
          languageId,
          "vocabulary",
        ),
      ).toBe(0);
    });
  });
});

describe("deleteGhostProgressForLearningItems (spec 20 Danger Zone — Reset to Level)", () => {
  it("removes Ghost state only for the given learning items", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, grammarYId } =
        await seedTestFixtures(tx);
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: NOW,
      });
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: grammarYId,
        sentenceId: SENTENCE_Y_ID,
        contentType: "grammar",
        mode: "on",
        now: NOW,
      });

      await deleteGhostProgressForLearningItems(tx, learnerId, [gatoId]);

      expect(
        await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID),
      ).toBeUndefined();
      expect(
        await findGhostRow(tx, learnerId, grammarYId, SENTENCE_Y_ID),
      ).toBeDefined();
    });
  });

  it("is a no-op for an empty list", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: NOW,
      });

      await deleteGhostProgressForLearningItems(tx, learnerId, []);

      expect(
        await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID),
      ).toBeDefined();
    });
  });
});
