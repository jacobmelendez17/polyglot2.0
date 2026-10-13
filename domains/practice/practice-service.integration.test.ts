import { describe, expect, it } from "vitest";

import type { DbClient } from "@/db/client";
import { languages, practiceSessions, users } from "@/db/schema";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getPracticeActivity } from "./practice-repository";
import { getPracticeHub } from "./practice-service";

/**
 * Each test owns its language and learners, so exact counts stay true no
 * matter what the shared test branch already contains.
 */
async function seedLearner(tx: DbClient) {
  const unique = crypto.randomUUID();
  const [language] = await tx
    .insert(languages)
    .values({
      code: `fixture-prac-${unique}`,
      slug: `fixture-prac-${unique}`,
      name: "Practice Fixture",
    })
    .returning();
  const [learner] = await tx
    .insert(users)
    .values({ activeLanguageId: language!.id })
    .returning();
  return { languageId: language!.id, userId: learner!.id };
}

const NOW = new Date("2026-09-23T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe("getPracticeActivity", () => {
  it("returns nothing for a learner with no sessions", async () => {
    await withTestTransaction(async (tx) => {
      const { userId, languageId } = await seedLearner(tx);

      expect(
        await getPracticeActivity(tx, userId, languageId, daysAgo(7), NOW),
      ).toEqual([]);
    });
  });

  it("counts only recent sessions but reports the last one from all history", async () => {
    await withTestTransaction(async (tx) => {
      const { userId, languageId } = await seedLearner(tx);
      await tx.insert(practiceSessions).values([
        {
          userId,
          languageId,
          practiceType: "sentences",
          completedAt: daysAgo(1),
        },
        {
          userId,
          languageId,
          practiceType: "sentences",
          completedAt: daysAgo(3),
        },
        {
          userId,
          languageId,
          practiceType: "sentences",
          completedAt: daysAgo(30),
        },
        {
          userId,
          languageId,
          practiceType: "journal",
          completedAt: daysAgo(20),
        },
      ]);

      const activity = await getPracticeActivity(
        tx,
        userId,
        languageId,
        daysAgo(7),
        NOW,
      );
      const byType = new Map(activity.map((row) => [row.practiceType, row]));

      expect(byType.get("sentences")?.recentSessionCount).toBe(2);
      expect(byType.get("sentences")?.lastCompletedAt).toEqual(daysAgo(1));
      // Not practiced in the window: zero recent, but still "last practiced".
      expect(byType.get("journal")?.recentSessionCount).toBe(0);
      expect(byType.get("journal")?.lastCompletedAt).toEqual(daysAgo(20));
    });
  });

  it("counts today's sessions from the given start of day only", async () => {
    await withTestTransaction(async (tx) => {
      const { userId, languageId } = await seedLearner(tx);
      // Midnight in New York, 2026-09-23, is 04:00 UTC.
      const todayStart = new Date("2026-09-23T04:00:00.000Z");
      await tx.insert(practiceSessions).values([
        {
          userId,
          languageId,
          practiceType: "listening",
          completedAt: new Date("2026-09-23T04:00:00.000Z"),
        },
        {
          userId,
          languageId,
          practiceType: "listening",
          completedAt: new Date("2026-09-23T11:00:00.000Z"),
        },
        // Already the 23rd in UTC, but still the 22nd in New York.
        {
          userId,
          languageId,
          practiceType: "listening",
          completedAt: new Date("2026-09-23T03:59:59.000Z"),
        },
      ]);

      const [listening] = await getPracticeActivity(
        tx,
        userId,
        languageId,
        daysAgo(7),
        todayStart,
      );

      expect(listening?.todaySessionCount).toBe(2);
      expect(listening?.recentSessionCount).toBe(3);
    });
  });

  it("never mixes in another learner's or another language's sessions", async () => {
    await withTestTransaction(async (tx) => {
      const mine = await seedLearner(tx);
      const other = await seedLearner(tx);
      await tx.insert(practiceSessions).values([
        {
          userId: other.userId,
          languageId: other.languageId,
          practiceType: "listening",
          completedAt: daysAgo(1),
        },
        // Same learner, different language: language isolation.
        {
          userId: mine.userId,
          languageId: other.languageId,
          practiceType: "speaking",
          completedAt: daysAgo(1),
        },
      ]);

      expect(
        await getPracticeActivity(
          tx,
          mine.userId,
          mine.languageId,
          daysAgo(7),
          NOW,
        ),
      ).toEqual([]);
    });
  });
});

describe("getPracticeHub", () => {
  it("builds the hub view from a learner's real sessions", async () => {
    await withTestTransaction(async (tx) => {
      const { userId, languageId } = await seedLearner(tx);
      const now = new Date();
      await tx.insert(practiceSessions).values({
        userId,
        languageId,
        practiceType: "journal",
        completedAt: new Date(now.getTime() - 2 * DAY_MS),
      });

      const view = await getPracticeHub(tx, {
        userId,
        languageId,
        timeZone: "UTC",
      });
      const writing = view.groves.find((grove) => grove.skill === "writing");

      expect(writing?.recentSessionCount).toBe(1);
      expect(
        writing?.practices.find((practice) => practice.type === "journal")
          ?.lastPracticedLabel,
      ).toBe("2 days ago");
      expect(view.today.totalSessionCount).toBe(0);
    });
  });
});
