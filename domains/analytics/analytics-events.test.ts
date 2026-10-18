import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENT_SCHEMA_VERSION,
  SRS_STAGE_CATEGORIES,
  srsStageCategory,
  validateAnalyticsEvent,
  type AnalyticsEventName,
  type PendingAnalyticsEvent,
} from "./analytics-events";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const CONTEXT = {
  languageCode: "es-MX",
  appEnvironment: "production",
} as const;

/** One valid payload per approved event. */
const VALID: Record<AnalyticsEventName, Record<string, unknown>> = {
  onboarding_started: {},
  onboarding_completed: {},
  lesson_started: { session_key: SESSION },
  lesson_completed: {
    session_key: SESSION,
    item_count: 6,
    accuracy_percent: 83,
    level: 2,
  },
  review_session_started: { session_key: SESSION },
  review_item_completed: {
    session_key: SESSION,
    content_type: "vocabulary",
    result: "advanced",
    srs_stage_before: "beginner",
    srs_stage_after: "familiar",
    level: 3,
  },
  review_session_completed: {
    session_key: SESSION,
    item_count: 20,
    duration_seconds: 540,
  },
  practice_started: { practice_type: "listening" },
  practice_completed: {
    practice_type: "sentences",
    duration_seconds: 300,
    accuracy_percent: 90,
  },
  level_unlocked: { level: 4 },
  dashboard_widget_added: {},
  dashboard_widget_removed: {},
};

function pending(
  event: AnalyticsEventName,
  properties: Record<string, unknown>,
  overrides: Partial<PendingAnalyticsEvent> = {},
): PendingAnalyticsEvent {
  return {
    event,
    languageId: "language-1",
    properties: properties as never,
    dedupeKey: "key",
    occurredAt: new Date("2026-10-17T20:00:00Z"),
    source: "server",
    ...overrides,
  };
}

describe("the approved event catalog (spec 27 §6.1)", () => {
  it("is exactly the twelve approved events, named in snake_case", () => {
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual(
      [
        "dashboard_widget_added",
        "dashboard_widget_removed",
        "lesson_completed",
        "lesson_started",
        "level_unlocked",
        "onboarding_completed",
        "onboarding_started",
        "practice_completed",
        "practice_started",
        "review_item_completed",
        "review_session_completed",
        "review_session_started",
      ].sort(),
    );
    for (const name of ANALYTICS_EVENT_NAMES) {
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it("says which events the product can produce today, and which have nothing to emit them yet", () => {
    const emitted = ANALYTICS_EVENT_NAMES.filter(
      (name) => ANALYTICS_EVENTS[name].emitted,
    );
    expect([...emitted].sort()).toEqual([
      "lesson_completed",
      "lesson_started",
      "level_unlocked",
      "onboarding_completed",
      "onboarding_started",
      "review_item_completed",
      "review_session_started",
    ]);
  });

  it.each(ANALYTICS_EVENT_NAMES)("%s accepts its own valid payload", (name) => {
    expect(
      ANALYTICS_EVENTS[name].properties.safeParse(VALID[name]).success,
    ).toBe(true);
  });
});

describe("a property that is not on the list can never ride along", () => {
  const FORBIDDEN = [
    "answer",
    "typed_answer",
    "journal",
    "journal_text",
    "note",
    "notes",
    "email",
    "name",
    "display_name",
    "username",
    "user_id",
    "userId",
    "clerk_id",
    "ip",
    "$ip",
    "url",
    "path",
    "query",
    "token",
    "password",
    "label",
    "term",
    "word",
    "meaning",
    "sentence",
    "sql",
    "error",
    "message",
    "item_id",
    "learning_item_id",
  ];

  it.each(ANALYTICS_EVENT_NAMES)(
    "%s rejects every unlisted key, including the ones that name private content",
    (name) => {
      for (const key of FORBIDDEN) {
        const result = ANALYTICS_EVENTS[name].properties.safeParse({
          ...VALID[name],
          [key]: "hunter2",
        });
        expect(result.success, `${name} accepted "${key}"`).toBe(false);
      }
    },
  );

  it.each(ANALYTICS_EVENT_NAMES)(
    "%s rejects the common properties if a caller tries to supply them",
    (name) => {
      for (const key of [
        "language",
        "app_environment",
        "event_schema_version",
        "source",
      ]) {
        expect(
          ANALYTICS_EVENTS[name].properties.safeParse({
            ...VALID[name],
            [key]: "x",
          }).success,
        ).toBe(false);
      }
    },
  );

  it("rejects a secret placed in a property that is allowed, because every allowed value is bounded", () => {
    const secrets = ["hunter2", "sk_live_abc123", "a@b.com", "SELECT 1"];
    const attempts: [AnalyticsEventName, string][] = [
      ["lesson_started", "session_key"],
      ["lesson_completed", "session_key"],
      ["review_item_completed", "content_type"],
      ["review_item_completed", "result"],
      ["review_item_completed", "srs_stage_before"],
      ["review_item_completed", "srs_stage_after"],
      ["practice_started", "practice_type"],
    ];
    for (const [name, key] of attempts) {
      for (const secret of secrets) {
        expect(
          ANALYTICS_EVENTS[name].properties.safeParse({
            ...VALID[name],
            [key]: secret,
          }).success,
          `${name}.${key} accepted ${secret}`,
        ).toBe(false);
      }
    }
  });

  it("takes the SRS stage as a category only: an exact stage is refused", () => {
    for (const exact of ["beginner_1", "beginner_4", "familiar_2"]) {
      expect(
        ANALYTICS_EVENTS.review_item_completed.properties.safeParse({
          ...VALID.review_item_completed,
          srs_stage_before: exact,
        }).success,
      ).toBe(false);
    }
  });

  it("refuses a missing required property", () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const key of Object.keys(VALID[name])) {
        if (key === "accuracy_percent" && name === "practice_completed")
          continue; // optional
        const without = { ...VALID[name] };
        delete without[key];
        expect(
          ANALYTICS_EVENTS[name].properties.safeParse(without).success,
          `${name} accepted a payload without ${key}`,
        ).toBe(false);
      }
    }
  });

  it.each([
    ["lesson_completed", { item_count: 0 }],
    ["lesson_completed", { item_count: 101 }],
    ["lesson_completed", { item_count: 2.5 }],
    ["lesson_completed", { accuracy_percent: 101 }],
    ["lesson_completed", { accuracy_percent: -1 }],
    ["lesson_completed", { level: 0 }],
    ["lesson_completed", { level: 1000 }],
    ["lesson_completed", { session_key: "not-a-uuid" }],
    ["review_item_completed", { result: "skipped" }],
    ["review_item_completed", { content_type: "kanji" }],
    ["review_item_completed", { level: "3" }],
    ["level_unlocked", { level: 0 }],
    ["practice_completed", { duration_seconds: -5 }],
    ["practice_completed", { duration_seconds: 86_401 }],
    ["practice_started", { practice_type: "karaoke" }],
  ] as [AnalyticsEventName, Record<string, unknown>][])(
    "refuses %s with %j",
    (name, change) => {
      expect(
        ANALYTICS_EVENTS[name].properties.safeParse({
          ...VALID[name],
          ...change,
        }).success,
      ).toBe(false);
    },
  );

  it("lets nothing through when fed seeded junk: whatever parses holds only listed keys and bounded values", () => {
    // A small seeded generator, so the sweep is the same every run.
    let seed = 0x2f6e2b1;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const junkValues: unknown[] = [
      "x",
      "hunter2",
      "",
      " ",
      0,
      1,
      -1,
      5,
      99,
      1e9,
      NaN,
      true,
      false,
      null,
      undefined,
      [],
      {},
      ["a"],
      { a: 1 },
      SESSION,
      "advanced",
      "beginner",
    ];
    const keys = [
      ...new Set(
        Object.values(VALID).flatMap((payload) => Object.keys(payload)),
      ),
      "answer",
      "email",
      "user_id",
    ];

    for (let round = 0; round < 3_000; round++) {
      const name =
        ANALYTICS_EVENT_NAMES[
          Math.floor(next() * ANALYTICS_EVENT_NAMES.length)
        ]!;
      const payload: Record<string, unknown> = {};
      const size = Math.floor(next() * 5);
      for (let i = 0; i < size; i++) {
        payload[keys[Math.floor(next() * keys.length)]!] =
          junkValues[Math.floor(next() * junkValues.length)];
      }
      const result = ANALYTICS_EVENTS[name].properties.safeParse(payload);
      if (!result.success) continue;
      const allowed = Object.keys(VALID[name]);
      for (const [key, value] of Object.entries(result.data)) {
        expect(allowed, `${name} let through ${key}`).toContain(key);
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });
});

describe("srsStageCategory", () => {
  it.each([
    ["beginner_1", "beginner"],
    ["beginner_4", "beginner"],
    ["familiar_1", "familiar"],
    ["familiar_2", "familiar"],
    ["intermediate", "intermediate"],
    ["master", "master"],
    ["fluent", "fluent"],
  ])("maps %s to %s", (stage, category) => {
    expect(srsStageCategory(stage)).toBe(category);
  });

  it("covers every category exactly", () => {
    expect(
      ["beginner_1", "familiar_1", "intermediate", "master", "fluent"].map(
        (stage) => srsStageCategory(stage),
      ),
    ).toEqual([...SRS_STAGE_CATEGORIES]);
  });

  it.each([
    "",
    "beginner",
    "legend",
    "Beginner_1",
    "beginner_x",
    "x_1",
    "hunter2",
  ])("gives nothing for %j, which is not a stage name", (value) => {
    // "beginner" with no number is a category name but not a stored stage;
    // it still maps, harmlessly, to itself. Everything else gives null.
    if (value === "beginner") {
      expect(srsStageCategory(value)).toBe("beginner");
    } else {
      expect(srsStageCategory(value)).toBeNull();
    }
  });
});

describe("validateAnalyticsEvent — the one gate before anything is sent", () => {
  it("returns the event's own properties plus the four common ones, and nothing else", () => {
    const result = validateAnalyticsEvent(
      pending("lesson_completed", VALID.lesson_completed),
      CONTEXT,
    );

    expect(result).toEqual({
      ok: true,
      properties: {
        language: "es-MX",
        app_environment: "production",
        event_schema_version: ANALYTICS_EVENT_SCHEMA_VERSION,
        source: "server",
        session_key: SESSION,
        item_count: 6,
        accuracy_percent: 83,
        level: 2,
      },
    });
  });

  it("labels a browser report as one", () => {
    const result = validateAnalyticsEvent(
      pending("lesson_started", VALID.lesson_started, {
        source: "browser_intent",
      }),
      CONTEXT,
    );
    expect(result).toMatchObject({
      ok: true,
      properties: { source: "browser_intent" },
    });
  });

  it("drops an event whose properties break the schema, and names only the paths", () => {
    const result = validateAnalyticsEvent(
      pending("lesson_completed", {
        ...VALID.lesson_completed,
        accuracy_percent: 240,
        answer: "hunter2",
      }),
      CONTEXT,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_properties");
    expect(result.paths.sort()).toEqual(["accuracy_percent", ""].sort());
    // What the learner might have typed never reaches the diagnostic.
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(result)).not.toContain("240");
  });

  it("drops an event it has never heard of", () => {
    const result = validateAnalyticsEvent(
      pending("lesson_exploded" as never, {}),
      CONTEXT,
    );
    expect(result).toEqual({ ok: false, reason: "unknown_event", paths: [] });
  });

  it("does not mistake an inherited object property for an event", () => {
    for (const name of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ]) {
      expect(
        validateAnalyticsEvent(pending(name as never, {}), CONTEXT),
      ).toMatchObject({ ok: false, reason: "unknown_event" });
    }
  });

  it.each(["es MX", "", "español", "x".repeat(40), "es_MX", "1234"])(
    "drops an event whose language code is %j",
    (languageCode) => {
      const result = validateAnalyticsEvent(pending("onboarding_started", {}), {
        ...CONTEXT,
        languageCode,
      });
      expect(result).toMatchObject({ ok: false, reason: "invalid_context" });
    },
  );

  it.each(["es-MX", "tl-PH", "es", "pt-BR", "zh-Hans-CN"])(
    "accepts the language code %s",
    (languageCode) => {
      expect(
        validateAnalyticsEvent(pending("onboarding_started", {}), {
          ...CONTEXT,
          languageCode,
        }).ok,
      ).toBe(true);
    },
  );

  it("drops an event for an environment that is not one of the three", () => {
    const result = validateAnalyticsEvent(pending("onboarding_started", {}), {
      ...CONTEXT,
      appEnvironment: "staging" as never,
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid_context" });
  });

  it("drops an event whose source is not one of the two", () => {
    const result = validateAnalyticsEvent(
      pending("onboarding_started", {}, { source: "somewhere" as never }),
      CONTEXT,
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid_context" });
  });
});
