import { describe, expect, it } from "vitest";

import { collectAnalyticsEvents } from "./analytics-event-collector";
import { validateAnalyticsEvent } from "./analytics-events";
import {
  buildOnboardingCompletedEvent,
  recordLessonCompleted,
  recordLevelUnlocked,
  recordReviewItemCompleted,
} from "./record-event";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const KEY = "0d3f6c1e-8d2b-4c35-b6a1-2f0f3b9d7a44";
const CONTEXT = {
  languageCode: "es-MX",
  appEnvironment: "production",
} as const;

async function recorded(work: () => void) {
  const { events } = await collectAnalyticsEvents(async () => work());
  return events;
}

describe("recordLessonCompleted", () => {
  it("queues one lesson_completed with counts only, which the catalog accepts", async () => {
    const [queued, ...rest] = await recorded(() =>
      recordLessonCompleted({
        languageId: "language-1",
        sessionKey: SESSION,
        idempotencyKey: KEY,
        itemCount: 6,
        accuracyPercent: 83,
        level: 2,
      }),
    );

    expect(rest).toEqual([]);
    expect(queued).toMatchObject({
      event: "lesson_completed",
      languageId: "language-1",
      source: "server",
      dedupeKey: `lesson_completed:${KEY}`,
      properties: {
        session_key: SESSION,
        item_count: 6,
        accuracy_percent: 83,
        level: 2,
      },
    });
    expect(Object.keys(queued!.properties).sort()).toEqual([
      "accuracy_percent",
      "item_count",
      "level",
      "session_key",
    ]);
    expect(validateAnalyticsEvent(queued!, CONTEXT).ok).toBe(true);
  });
});

describe("recordReviewItemCompleted", () => {
  const base = {
    languageId: "language-1",
    sessionKey: SESSION,
    idempotencyKey: KEY,
    contentType: "grammar" as const,
    result: "penalized" as const,
    stageBefore: "familiar_2",
    stageAfter: "beginner_4",
    level: 3,
  };

  it("queues one review_item_completed that carries stage categories, never exact stages", async () => {
    const [queued] = await recorded(() => recordReviewItemCompleted(base));

    expect(queued).toMatchObject({
      event: "review_item_completed",
      dedupeKey: `review_item_completed:${KEY}`,
      properties: {
        session_key: SESSION,
        content_type: "grammar",
        result: "penalized",
        srs_stage_before: "familiar",
        srs_stage_after: "beginner",
        level: 3,
      },
    });
    expect(JSON.stringify(queued!.properties)).not.toMatch(/_[0-9]/);
    expect(validateAnalyticsEvent(queued!, CONTEXT).ok).toBe(true);
  });

  it("queues nothing for a stage that is not a stage, rather than a guess", async () => {
    expect(
      await recorded(() =>
        recordReviewItemCompleted({ ...base, stageBefore: "hunter2" }),
      ),
    ).toEqual([]);
    expect(
      await recorded(() =>
        recordReviewItemCompleted({ ...base, stageAfter: "" }),
      ),
    ).toEqual([]);
  });
});

describe("recordLevelUnlocked", () => {
  it("queues one level_unlocked keyed by the level, so a repeat is the same event", async () => {
    const [queued] = await recorded(() =>
      recordLevelUnlocked({
        languageId: "language-1",
        levelId: "level-id-9",
        level: 9,
      }),
    );

    expect(queued).toMatchObject({
      event: "level_unlocked",
      properties: { level: 9 },
      dedupeKey: "level_unlocked:level-id-9",
    });
    expect(Object.keys(queued!.properties)).toEqual(["level"]);
    expect(validateAnalyticsEvent(queued!, CONTEXT).ok).toBe(true);
  });
});

describe("the recorders are inert outside a collection scope", () => {
  it("do nothing, and do not throw, when no action opened a scope", () => {
    expect(() =>
      recordLevelUnlocked({ languageId: "l", levelId: "x", level: 2 }),
    ).not.toThrow();
    expect(() =>
      recordLessonCompleted({
        languageId: "l",
        sessionKey: SESSION,
        idempotencyKey: KEY,
        itemCount: 1,
        accuracyPercent: 100,
        level: 1,
      }),
    ).not.toThrow();
  });
});

describe("buildOnboardingCompletedEvent", () => {
  it("builds the once-per-account milestone, with no properties", () => {
    const built = buildOnboardingCompletedEvent({ languageId: "language-1" });

    expect(built).toMatchObject({
      event: "onboarding_completed",
      languageId: "language-1",
      properties: {},
      dedupeKey: "onboarding_completed",
      source: "server",
    });
    expect(validateAnalyticsEvent(built, CONTEXT).ok).toBe(true);
  });
});
