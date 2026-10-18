import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import {
  languages,
  learningItems,
  levels,
  userAnalyticsConsent,
  userItemProgress,
  userLevelProgress,
  users,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import {
  FIXTURE_LEVEL_NUMBER,
  FIXTURE_NEXT_LEVEL_NUMBER,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { testDb } from "@/db/test/test-client";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  getEligibleLessonItems,
  getLessonItemsByIds,
} from "@/domains/curriculum/lesson-curriculum-repository";
import { completeLesson } from "@/domains/lessons/lesson-completion";
import type { LessonCurriculumReader } from "@/domains/lessons/lesson-curriculum-reader";
import { signLessonState } from "@/domains/lessons/lesson-token";
import type { LessonState } from "@/domains/lessons/lesson-types";
import { applyReviewCompletion } from "@/domains/srs/review-completion";
import type { SrsStage } from "@/domains/srs/srs-types";
import { LessonError } from "@/lib/errors/lesson-errors";
import type {
  AnalyticsCaptureInput,
  AnalyticsProvider,
} from "@/providers/analytics/types";

import { ANALYTICS_POLICY_VERSION } from "./analytics-consent";
import { setAnalyticsConsent } from "./analytics-consent-service";
import { emitAnalyticsEvents } from "./analytics-emitter";
import {
  collectAnalyticsEvents,
  queueAnalyticsEvent,
} from "./analytics-event-collector";
import type { PendingAnalyticsEvent } from "./analytics-events";

/**
 * Spec 27 Unit 27.3 against real PostgreSQL: that what the product's own
 * transactions queue is exactly what gets reported — once, only after the work
 * has succeeded, only for a learner who consents *at the moment of sending*,
 * and carrying nothing that identifies the learner or the content.
 *
 * The domain calls run the real lesson and review transactions (idempotency
 * included); the emitter runs against the real consent gate; only the analytics
 * provider is a recording stand-in, because the network is the one thing a test
 * must never reach.
 */

const OLDER_NOTICE = "2020-01-01";

function recordingProvider() {
  const captured: AnalyticsCaptureInput[] = [];
  const provider = {
    capture: vi.fn((input: AnalyticsCaptureInput) => void captured.push(input)),
    flush: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
  } satisfies AnalyticsProvider;
  return { provider, captured };
}

function emitFor(
  db: DbClient,
  provider: AnalyticsProvider,
  userId: string,
  events: PendingAnalyticsEvent[],
) {
  return emitAnalyticsEvents(
    { db, provider, appEnvironment: "production" },
    { userId, events },
  );
}

async function consent(db: DbClient, userId: string) {
  await setAnalyticsConsent(db, {
    userId,
    status: "accepted",
    expectedRevision: null,
  });
  const [row] = await db
    .select()
    .from(userAnalyticsConsent)
    .where(eq(userAnalyticsConsent.userId, userId));
  return row!;
}

/** Nothing that names the learner, their account, or what they studied may appear in what is sent. */
function expectNothingIdentifying(sent: unknown, forbidden: string[]) {
  const serialized = JSON.stringify(sent);
  for (const value of forbidden) {
    expect(serialized, `"${value}" must not be sent`).not.toContain(value);
  }
}

// ---------------------------------------------------------------------------
// A completed lesson
// ---------------------------------------------------------------------------

let counter = 0;

async function seedLesson(tx: TestTx, itemCount = 3) {
  counter += 1;
  const suffix = `${counter}${Math.floor(Math.random() * 100000)}`;

  const [language] = await tx
    .insert(languages)
    .values({
      code: `es-C${suffix}`,
      slug: `spanish-capture-${suffix}`,
      name: `Spanish (capture ${suffix})`,
    })
    .returning();
  const [level] = await tx
    .insert(levels)
    .values({
      languageId: language!.id,
      levelNumber: 1,
      name: "Level 1",
      status: "published",
    })
    .returning();
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({
      levelId: level!.id,
      languageId: language!.id,
      name: "Basics",
      position: 1,
      status: "published",
    })
    .returning();
  const [user] = await tx
    .insert(users)
    .values({
      clerkUserId: `analytics-capture-${suffix}`,
      role: "user",
      activeLanguageId: language!.id,
    })
    .returning();
  await tx
    .insert(userLevelProgress)
    .values({ userId: user!.id, levelId: level!.id, unlockedAt: new Date() });

  const itemIds: string[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const [item] = await tx
      .insert(learningItems)
      .values({
        languageId: language!.id,
        levelId: level!.id,
        type: "vocabulary",
        status: "published",
        position: index + 1,
        lessonPriority: index + 1,
      })
      .returning();
    await tx.insert(vocabularyItems).values({
      learningItemId: item!.id,
      vocabularyGroupId: group!.id,
      term: `palabra${index}`,
      primaryMeaning: `word${index}`,
      partOfSpeech: "noun",
    });
    itemIds.push(item!.id);
  }

  return {
    languageId: language!.id,
    languageCode: language!.code,
    levelId: level!.id,
    groupId: group!.id,
    userId: user!.id,
    clerkUserId: user!.clerkUserId!,
    itemIds,
  };
}

type LessonFixture = Awaited<ReturnType<typeof seedLesson>>;

async function completedToken(
  fixture: LessonFixture,
  options: { sessionId?: string; attempts?: number; correctAttempts?: number },
) {
  const state: LessonState = {
    sessionId: options.sessionId ?? randomUUID(),
    userId: fixture.userId,
    languageId: fixture.languageId,
    languageCode: fixture.languageCode,
    batch: fixture.itemIds.map((itemId) => ({
      itemId,
      itemType: "vocabulary" as const,
    })),
    viewedItemIds: fixture.itemIds,
    phase: "complete",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
    quiz: {
      questions: fixture.itemIds.map((itemId) => ({
        id: `q-${itemId}`,
        itemId,
        itemType: "vocabulary" as const,
        direction: "targetToEnglish" as const,
      })),
      satisfiedQuestionIds: fixture.itemIds.map((itemId) => `q-${itemId}`),
      queue: [],
      attempts: options.attempts ?? fixture.itemIds.length,
      correctAttempts: options.correctAttempts ?? fixture.itemIds.length,
    },
  };
  return signLessonState(state);
}

function readerFor(tx: TestTx): LessonCurriculumReader {
  return {
    getEligibleLearningItems: (userId, languageId) =>
      getEligibleLessonItems(tx, userId, languageId),
    getLearningItemsByIds: (ids) => getLessonItemsByIds(tx, ids),
  };
}

async function completeInScope(
  tx: TestTx,
  fixture: LessonFixture,
  options: {
    sessionId?: string;
    idempotencyKey?: string;
    attempts?: number;
    correctAttempts?: number;
  } = {},
) {
  const token = await completedToken(fixture, options);
  return collectAnalyticsEvents(() =>
    completeLesson(tx, {
      curriculum: readerFor(tx),
      token,
      userId: fixture.userId,
      languageId: fixture.languageId,
      idempotencyKey: options.idempotencyKey ?? randomUUID(),
    }),
  );
}

describe("a completed lesson", () => {
  it("is reported once for a consenting learner: counts and a percentage under the pseudonym, nothing that identifies them or the content", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const { analyticsId } = await consent(tx, fixture.userId);
      const sessionId = randomUUID();

      const { events } = await completeInScope(tx, fixture, {
        sessionId,
        attempts: 4,
        correctAttempts: 3,
      });
      expect(events).toHaveLength(1);

      const { provider, captured } = recordingProvider();
      const outcome = await emitFor(tx, provider, fixture.userId, events);

      expect(outcome).toEqual({ captured: 1, dropped: 0 });
      expect(provider.flush).toHaveBeenCalledTimes(1);
      expect(captured).toEqual([
        {
          event: "lesson_completed",
          distinctId: analyticsId,
          properties: {
            language: fixture.languageCode,
            app_environment: "production",
            event_schema_version: 1,
            source: "server",
            session_key: sessionId,
            item_count: 3,
            accuracy_percent: 75,
            level: 1,
          },
          dedupeKey: expect.stringMatching(/^lesson_completed:/),
          occurredAt: expect.any(Date),
        },
      ]);
      expectNothingIdentifying(captured, [
        fixture.userId,
        fixture.clerkUserId,
        fixture.languageId,
        fixture.levelId,
        fixture.groupId,
        ...fixture.itemIds,
        "palabra",
        "word",
      ]);
    });
  });

  it("queues nothing the second time the same completion arrives — a retry is not a second lesson", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const idempotencyKey = randomUUID();
      const sessionId = randomUUID();

      const first = await completeInScope(tx, fixture, {
        sessionId,
        idempotencyKey,
      });
      const replay = await completeInScope(tx, fixture, {
        sessionId,
        idempotencyKey,
      });

      expect(first.events).toHaveLength(1);
      expect(replay.events).toEqual([]);
      // Same result either way: the replay is still a success for the learner.
      expect(replay.result.enrolledItemIds).toEqual(
        first.result.enrolledItemIds,
      );
    });
  });

  it("reports nothing when the completion is refused", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      await completeInScope(tx, fixture);

      // The same batch again under a new key is a genuine duplicate, and refused.
      const refused = completeInScope(tx, fixture);

      await expect(refused).rejects.toBeInstanceOf(LessonError);
      // The failed scope handed back no events to send.
      const { events } = await collectAnalyticsEvents(async () => undefined);
      expect(events).toEqual([]);
    });
  });

  it("sends nothing for a learner who has never chosen, and the lesson is untouched", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      const { events, result } = await completeInScope(tx, fixture);

      const { provider, captured } = recordingProvider();
      const outcome = await emitFor(tx, provider, fixture.userId, events);

      expect(outcome).toEqual({ captured: 0, dropped: 1 });
      expect(captured).toEqual([]);
      expect(provider.flush).not.toHaveBeenCalled();
      const enrolled = await tx
        .select()
        .from(userItemProgress)
        .where(eq(userItemProgress.userId, fixture.userId));
      expect(enrolled).toHaveLength(result.enrolledItemIds.length);
    });
  });

  it("sends nothing if the learner withdrew after the lesson committed and before the event went out", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      await consent(tx, fixture.userId);
      const { events } = await completeInScope(tx, fixture);

      await setAnalyticsConsent(tx, {
        userId: fixture.userId,
        status: "declined",
        expectedRevision: 1,
      });

      const { provider, captured } = recordingProvider();
      const outcome = await emitFor(tx, provider, fixture.userId, events);

      expect(outcome).toEqual({ captured: 0, dropped: 1 });
      expect(captured).toEqual([]);
    });
  });

  it("is not undone, delayed or failed by a provider that is down", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLesson(tx);
      await consent(tx, fixture.userId);
      const { events, result } = await completeInScope(tx, fixture);

      const down = recordingProvider();
      down.provider.flush.mockRejectedValue(new Error("connect ETIMEDOUT"));
      await expect(
        emitFor(tx, down.provider, fixture.userId, events),
      ).resolves.toMatchObject({ captured: 0 });

      const throwing = recordingProvider();
      throwing.provider.capture.mockImplementation(() => {
        throw new Error("boom");
      });
      await expect(
        emitFor(tx, throwing.provider, fixture.userId, events),
      ).resolves.toMatchObject({ captured: 0 });

      const enrolled = await tx
        .select()
        .from(userItemProgress)
        .where(eq(userItemProgress.userId, fixture.userId));
      expect(enrolled).toHaveLength(result.enrolledItemIds.length);
    });
  });
});

// ---------------------------------------------------------------------------
// A completed review
// ---------------------------------------------------------------------------

async function markDue(
  tx: DbClient,
  userId: string,
  learningItemId: string,
  languageId: string,
  srsStage: SrsStage,
) {
  const baseline = {
    srsStage,
    nextReviewAt: new Date(Date.now() - 60_000),
    correctCount: 0,
    incorrectCount: 0,
    reviewCount: 0,
    version: 0,
    fluentAt: null,
  };
  await tx
    .insert(userItemProgress)
    .values({ userId, learningItemId, languageId, ...baseline })
    .onConflictDoUpdate({
      target: [userItemProgress.userId, userItemProgress.learningItemId],
      set: baseline,
    });
}

async function setStageNotDue(
  tx: DbClient,
  userId: string,
  learningItemId: string,
  languageId: string,
  srsStage: SrsStage,
) {
  const nextReviewAt = new Date(Date.now() + 60 * 60 * 1000);
  await tx
    .insert(userItemProgress)
    .values({ userId, learningItemId, languageId, srsStage, nextReviewAt })
    .onConflictDoUpdate({
      target: [userItemProgress.userId, userItemProgress.learningItemId],
      set: { srsStage, nextReviewAt },
    });
}

type ReviewFixture = Awaited<ReturnType<typeof seedTestFixtures>>;

function reviewInScope(
  tx: TestTx,
  fixture: ReviewFixture,
  itemId: string,
  options: {
    sessionId?: string;
    idempotencyKey?: string;
    hadIncorrectRequiredAnswer?: boolean;
  } = {},
) {
  return collectAnalyticsEvents(() =>
    applyReviewCompletion(tx, {
      userId: fixture.learnerId,
      languageId: fixture.languageId,
      learningItemId: itemId,
      expectedVersion: 0,
      requiredQuestionCount: 2,
      hadIncorrectRequiredAnswer: options.hadIncorrectRequiredAnswer ?? false,
      srsStrictness: "one_stage",
      srsIntervalMode: "default",
      reviewQueueTiming: "start_of_hour",
      timeZone: "UTC",
      fluentMode: true,
      now: new Date(),
      idempotencyKey: options.idempotencyKey ?? randomUUID(),
      sessionId: options.sessionId ?? randomUUID(),
    }),
  );
}

const names = (events: PendingAnalyticsEvent[]) =>
  events.map((event) => event.event);

describe("a completed review item", () => {
  it("is reported with coarse stage categories and the level, never the exact stage or the item", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      const { analyticsId } = await consent(tx, fixture.learnerId);
      await markDue(
        tx,
        fixture.learnerId,
        fixture.gatoId,
        fixture.languageId,
        "beginner_4",
      );
      const sessionId = randomUUID();

      const { events } = await reviewInScope(tx, fixture, fixture.gatoId, {
        sessionId,
      });
      expect(names(events)).toEqual(["review_item_completed"]);

      const { provider, captured } = recordingProvider();
      await emitFor(tx, provider, fixture.learnerId, events);

      expect(captured).toEqual([
        expect.objectContaining({
          event: "review_item_completed",
          distinctId: analyticsId,
          properties: {
            language: "es-MX",
            app_environment: "production",
            event_schema_version: 1,
            source: "server",
            session_key: sessionId,
            content_type: "vocabulary",
            result: "advanced",
            srs_stage_before: "beginner",
            srs_stage_after: "familiar",
            level: FIXTURE_LEVEL_NUMBER,
          },
        }),
      ]);
      expectNothingIdentifying(captured, [
        fixture.learnerId,
        fixture.gatoId,
        fixture.level1Id,
        "beginner_4",
        "familiar_1",
        "gato",
      ]);
    });
  });

  it("reports a penalty as a penalty, and a grammar point as grammar", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      await consent(tx, fixture.learnerId);
      await markDue(
        tx,
        fixture.learnerId,
        fixture.grammarYId,
        fixture.languageId,
        "familiar_1",
      );

      const { events } = await reviewInScope(tx, fixture, fixture.grammarYId, {
        hadIncorrectRequiredAnswer: true,
      });

      const { provider, captured } = recordingProvider();
      await emitFor(tx, provider, fixture.learnerId, events);

      expect(captured).toHaveLength(1);
      expect(captured[0]!.properties).toMatchObject({
        content_type: "grammar",
        result: "penalized",
        srs_stage_before: "familiar",
        srs_stage_after: "beginner",
      });
    });
  });

  it("queues nothing for a replay of the same completion", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      await markDue(
        tx,
        fixture.learnerId,
        fixture.gatoId,
        fixture.languageId,
        "beginner_1",
      );
      const options = {
        sessionId: randomUUID(),
        idempotencyKey: randomUUID(),
      };

      const first = await reviewInScope(tx, fixture, fixture.gatoId, options);
      const replay = await reviewInScope(tx, fixture, fixture.gatoId, options);

      expect(names(first.events)).toEqual(["review_item_completed"]);
      expect(replay.events).toEqual([]);
    });
  });

  it("queues nothing for a review that is refused", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      await markDue(
        tx,
        fixture.learnerId,
        fixture.gatoId,
        fixture.languageId,
        "beginner_1",
      );
      await tx
        .update(userItemProgress)
        .set({ version: 5 })
        .where(
          and(
            eq(userItemProgress.userId, fixture.learnerId),
            eq(userItemProgress.learningItemId, fixture.gatoId),
          ),
        );

      await expect(
        reviewInScope(tx, fixture, fixture.gatoId),
      ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    });
  });
});

describe("a level unlock", () => {
  /** Every published item in level 1 except `exceptId` already at Familiar 1 and not due, so completing `exceptId` crosses the unlock ratio. */
  async function readyToUnlock(
    tx: TestTx,
    fixture: ReviewFixture,
    exceptId: string,
  ) {
    const gating = await tx
      .select({ id: learningItems.id })
      .from(learningItems)
      .where(
        and(
          eq(learningItems.levelId, fixture.level1Id),
          eq(learningItems.status, "published"),
        ),
      );
    for (const item of gating) {
      if (item.id === exceptId) continue;
      await setStageNotDue(
        tx,
        fixture.learnerId,
        item.id,
        fixture.languageId,
        "familiar_1",
      );
    }
    await markDue(
      tx,
      fixture.learnerId,
      exceptId,
      fixture.languageId,
      "beginner_4",
    );
  }

  it("is reported once, as the new level number, alongside the review that earned it", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      const { analyticsId } = await consent(tx, fixture.learnerId);
      await readyToUnlock(tx, fixture, fixture.gatoId);

      const { events } = await reviewInScope(tx, fixture, fixture.gatoId);

      expect(names(events)).toEqual([
        "review_item_completed",
        "level_unlocked",
      ]);
      const { provider, captured } = recordingProvider();
      await emitFor(tx, provider, fixture.learnerId, events);

      expect(captured.map((input) => input.event)).toEqual([
        "review_item_completed",
        "level_unlocked",
      ]);
      expect(captured[1]).toMatchObject({
        distinctId: analyticsId,
        dedupeKey: `level_unlocked:${fixture.level2Id}`,
        properties: { level: FIXTURE_NEXT_LEVEL_NUMBER },
      });
      // The dedupe key names the level row (it is hashed into the event's uuid and
      // never sent); the properties that are sent carry no id at all.
      expectNothingIdentifying(captured[1]!.properties, [
        fixture.learnerId,
        fixture.level2Id,
      ]);
    });
  });

  it("is not reported again by a later review once the level is already unlocked", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      await readyToUnlock(tx, fixture, fixture.gatoId);
      const first = await reviewInScope(tx, fixture, fixture.gatoId);
      expect(names(first.events)).toContain("level_unlocked");

      // Another gating item is reviewed afterwards, with the ratio still met.
      await markDue(
        tx,
        fixture.learnerId,
        fixture.casaId,
        fixture.languageId,
        "familiar_1",
      );
      const later = await reviewInScope(tx, fixture, fixture.casaId);

      expect(names(later.events)).toEqual(["review_item_completed"]);
    });
  });

  it("is not reported for a level the learner already had, and the original unlock time stands", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedTestFixtures(tx);
      const earlier = new Date("2026-01-01T00:00:00Z");
      await tx.insert(userLevelProgress).values({
        userId: fixture.learnerId,
        levelId: fixture.level2Id,
        unlockedAt: earlier,
      });
      await readyToUnlock(tx, fixture, fixture.gatoId);

      const { events } = await reviewInScope(tx, fixture, fixture.gatoId);

      expect(names(events)).toEqual(["review_item_completed"]);
      const [unlock] = await tx
        .select()
        .from(userLevelProgress)
        .where(
          and(
            eq(userLevelProgress.userId, fixture.learnerId),
            eq(userLevelProgress.levelId, fixture.level2Id),
          ),
        );
      expect(unlock?.unlockedAt).toEqual(earlier);
    });
  });
});

// ---------------------------------------------------------------------------
// The collector inside a real transaction
// ---------------------------------------------------------------------------

function pendingEvent(dedupeKey: string): PendingAnalyticsEvent {
  return {
    event: "level_unlocked",
    languageId: randomUUID(),
    properties: { level: 2 },
    dedupeKey,
    occurredAt: new Date(),
    source: "server",
  };
}

describe("the collector across a real database transaction", () => {
  it("follows the work through the driver's awaits, so what a transaction queues is what is collected", async () => {
    const { result, events } = await collectAnalyticsEvents(() =>
      testDb.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        queueAnalyticsEvent(pendingEvent("first"));
        await tx.execute(sql`select 2`);
        queueAnalyticsEvent(pendingEvent("second"));
        return "committed";
      }),
    );

    expect(result).toBe("committed");
    expect(events.map((event) => event.dedupeKey)).toEqual(["first", "second"]);
  });

  it("hands back nothing when the transaction is rolled back, and the rows it wrote are gone too", async () => {
    const code = `es-R${Math.floor(Math.random() * 1_000_000)}`;
    const refused = new Error("the transaction was refused");

    await expect(
      collectAnalyticsEvents(() =>
        testDb.transaction(async (tx) => {
          await tx.insert(languages).values({
            code,
            slug: `rolled-back-${code}`,
            name: "Rolled back",
          });
          queueAnalyticsEvent(pendingEvent("queued-then-refused"));
          throw refused;
        }),
      ),
    ).rejects.toBe(refused);

    const rows = await testDb
      .select()
      .from(languages)
      .where(eq(languages.code, code));
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The consent gate at the moment of sending
// ---------------------------------------------------------------------------

describe("emission against the real consent gate", () => {
  async function language(tx: TestTx) {
    const [existing] = await tx
      .select()
      .from(languages)
      .where(eq(languages.code, "es-MX"))
      .limit(1);
    if (existing) return existing.id;
    const [created] = await tx
      .insert(languages)
      .values({
        code: "es-MX",
        slug: `spanish-${randomUUID()}`,
        name: "Spanish",
      })
      .returning();
    return created!.id;
  }

  async function learner(
    tx: TestTx,
    languageId: string,
    options: { sandboxOwnerUserId?: string } = {},
  ) {
    const [row] = await tx
      .insert(users)
      .values({
        clerkUserId: options.sandboxOwnerUserId
          ? null
          : `analytics-gate-${randomUUID()}`,
        activeLanguageId: languageId,
        isSandbox: Boolean(options.sandboxOwnerUserId),
        sandboxOwnerUserId: options.sandboxOwnerUserId ?? null,
      })
      .returning();
    return row!;
  }

  function lessonStarted(languageId: string): PendingAnalyticsEvent {
    const sessionKey = randomUUID();
    return {
      event: "lesson_started",
      languageId,
      properties: { session_key: sessionKey },
      dedupeKey: `lesson_started:${sessionKey}`,
      occurredAt: new Date(),
      source: "browser_intent",
    };
  }

  it("sends for a learner who currently consents", async () => {
    await withTestTransaction(async (tx) => {
      const languageId = await language(tx);
      const user = await learner(tx, languageId);
      const { analyticsId } = await consent(tx, user.id);
      const { provider, captured } = recordingProvider();

      const outcome = await emitFor(tx, provider, user.id, [
        lessonStarted(languageId),
      ]);

      expect(outcome).toEqual({ captured: 1, dropped: 0 });
      expect(captured[0]).toMatchObject({
        event: "lesson_started",
        distinctId: analyticsId,
        properties: { language: "es-MX", source: "browser_intent" },
      });
    });
  });

  const REFUSED: [
    string,
    (tx: TestTx, languageId: string) => Promise<{ id: string }>,
  ][] = [
    ["who has never chosen", async (tx, languageId) => learner(tx, languageId)],
    [
      "who declined",
      async (tx, languageId) => {
        const user = await learner(tx, languageId);
        await setAnalyticsConsent(tx, {
          userId: user.id,
          status: "declined",
          expectedRevision: null,
        });
        return user;
      },
    ],
    [
      "who accepted under an older notice",
      async (tx, languageId) => {
        const user = await learner(tx, languageId);
        await tx.insert(userAnalyticsConsent).values({
          userId: user.id,
          status: "accepted",
          policyVersion: OLDER_NOTICE,
          analyticsId: randomUUID(),
        });
        return user;
      },
    ],
    [
      "who is a sandbox persona, whatever is stored for them",
      async (tx, languageId) => {
        const owner = await learner(tx, languageId);
        const persona = await learner(tx, languageId, {
          sandboxOwnerUserId: owner.id,
        });
        await tx.insert(userAnalyticsConsent).values({
          userId: persona.id,
          status: "accepted",
          policyVersion: ANALYTICS_POLICY_VERSION,
          analyticsId: randomUUID(),
        });
        return persona;
      },
    ],
    ["that does not exist", async () => ({ id: randomUUID() })],
  ];

  it.each(REFUSED)(
    "sends nothing for an account %s",
    async (_label, arrange) => {
      await withTestTransaction(async (tx) => {
        const languageId = await language(tx);
        const user = await arrange(tx, languageId);
        const { provider, captured } = recordingProvider();

        const outcome = await emitFor(tx, provider, user.id, [
          lessonStarted(languageId),
        ]);

        expect(outcome).toEqual({ captured: 0, dropped: 1 });
        expect(captured).toEqual([]);
        expect(provider.flush).not.toHaveBeenCalled();
      });
    },
  );

  it("drops an event whose language no longer exists and still sends the others", async () => {
    await withTestTransaction(async (tx) => {
      const languageId = await language(tx);
      const user = await learner(tx, languageId);
      await consent(tx, user.id);
      const { provider, captured } = recordingProvider();

      const outcome = await emitFor(tx, provider, user.id, [
        lessonStarted(randomUUID()),
        lessonStarted(languageId),
      ]);

      expect(outcome).toEqual({ captured: 1, dropped: 1 });
      expect(captured).toHaveLength(1);
    });
  });
});
