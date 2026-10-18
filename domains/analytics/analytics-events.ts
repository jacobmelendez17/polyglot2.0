import { z } from "zod";

/**
 * Spec 27 Unit 27.3 — the product-analytics event catalog (spec §6.1): the
 * twelve approved events, each with a **strict** property schema. This is the
 * first of the three separate allowlists spec 27 §12 asks for (event
 * properties; exported logs; trace attributes), and it is deliberately narrow:
 *
 * - Every schema is `strictObject`, so a property that is not listed — an
 *   answer, a journal line, an email, a URL, a user id, anything someone adds
 *   to a call site later — makes the whole event invalid rather than riding
 *   along.
 * - Every listed value is a bounded integer, a fixed enum, or a UUID. There is
 *   no free-text field, so even a secret put into a listed property fails
 *   validation instead of being sent.
 * - Names are snake_case constants. A new event needs a documented reason,
 *   schema, owner and privacy review (spec §6.1) — it is added here or not at
 *   all.
 *
 * `emitted: false` marks an approved event that nothing in the product can
 * produce yet: practice sessions have no routes (and `practice_sessions` has no
 * writer), no dashboard-widget configuration is persisted anywhere, and a
 * review session's end is not known to the server. They are catalogued so the
 * contract is complete, and they will start when their features exist — no
 * emitter is invented for them.
 */

export const ANALYTICS_EVENT_SCHEMA_VERSION = 1;

export const ANALYTICS_EVENT_SOURCES = ["server", "browser_intent"] as const;
export type AnalyticsEventSource = (typeof ANALYTICS_EVENT_SOURCES)[number];

/** `beginner_1` … `fluent` as a coarse category: the exact stage within a band adds precision nobody needs and is easier to link to a person. */
export const SRS_STAGE_CATEGORIES = [
  "beginner",
  "familiar",
  "intermediate",
  "master",
  "fluent",
] as const;
export type SrsStageCategory = (typeof SRS_STAGE_CATEGORIES)[number];

/** Maps a stored SRS stage (`beginner_2`, `master`, …) to its category, or `null` for a value that is not a stage — so a bad value drops the event instead of being sent. */
export function srsStageCategory(stage: string): SrsStageCategory | null {
  const category = stage.replace(/_[0-9]+$/, "");
  return (SRS_STAGE_CATEGORIES as readonly string[]).includes(category)
    ? (category as SrsStageCategory)
    : null;
}

const PRACTICE_TYPES = [
  "listening",
  "speaking",
  "stories",
  "sentences",
  "journal",
  "conjugation",
] as const;

const levelNumber = z.int().min(1).max(999);
const percent = z.int().min(0).max(100);
const seconds = z.int().min(0).max(86_400);
const sessionKey = z.uuid();
const stageCategory = z.enum(SRS_STAGE_CATEGORIES);

type EventDefinition = {
  emitted: boolean;
  properties: z.ZodObject<z.ZodRawShape, z.core.$strict>;
};

export const ANALYTICS_EVENTS = {
  onboarding_started: {
    emitted: true,
    properties: z.strictObject({}),
  },
  onboarding_completed: {
    emitted: true,
    properties: z.strictObject({}),
  },
  lesson_started: {
    emitted: true,
    properties: z.strictObject({ session_key: sessionKey }),
  },
  lesson_completed: {
    emitted: true,
    properties: z.strictObject({
      session_key: sessionKey,
      item_count: z.int().min(1).max(100),
      accuracy_percent: percent,
      level: levelNumber,
    }),
  },
  review_session_started: {
    emitted: true,
    properties: z.strictObject({ session_key: sessionKey }),
  },
  review_item_completed: {
    emitted: true,
    properties: z.strictObject({
      session_key: sessionKey,
      content_type: z.enum(["vocabulary", "grammar"]),
      result: z.enum(["advanced", "penalized"]),
      srs_stage_before: stageCategory,
      srs_stage_after: stageCategory,
      level: levelNumber,
    }),
  },
  review_session_completed: {
    emitted: false,
    properties: z.strictObject({
      session_key: sessionKey,
      item_count: z.int().min(1).max(1000),
      duration_seconds: seconds,
    }),
  },
  practice_started: {
    emitted: false,
    properties: z.strictObject({ practice_type: z.enum(PRACTICE_TYPES) }),
  },
  practice_completed: {
    emitted: false,
    properties: z.strictObject({
      practice_type: z.enum(PRACTICE_TYPES),
      duration_seconds: seconds,
      accuracy_percent: percent.optional(),
    }),
  },
  level_unlocked: {
    emitted: true,
    properties: z.strictObject({ level: levelNumber }),
  },
  // No `widget` property yet, deliberately. Nothing persists a dashboard's
  // widget configuration today, so there is no closed list of widget ids to
  // allow — and a free-text widget name is exactly the kind of unbounded field
  // this catalog refuses. When the feature exists, its ids become an enum here,
  // as a reviewed change to this schema.
  dashboard_widget_added: {
    emitted: false,
    properties: z.strictObject({}),
  },
  dashboard_widget_removed: {
    emitted: false,
    properties: z.strictObject({}),
  },
} as const satisfies Record<string, EventDefinition>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

export const ANALYTICS_EVENT_NAMES = Object.keys(
  ANALYTICS_EVENTS,
) as AnalyticsEventName[];

export type AnalyticsEventProperties<E extends AnalyticsEventName> = z.input<
  (typeof ANALYTICS_EVENTS)[E]["properties"]
>;

/** What the application has decided happened, before anything has been validated or sent. */
export type PendingAnalyticsEvent<
  E extends AnalyticsEventName = AnalyticsEventName,
> = {
  event: E;
  /** The learner's language, resolved to its code only when the event is sent. */
  languageId: string;
  properties: AnalyticsEventProperties<E>;
  /** One logical event, one key: a retry or replay of the same completion carries the same key (spec §6.3). */
  dedupeKey: string;
  occurredAt: Date;
  source: AnalyticsEventSource;
};

const commonPropertiesSchema = z.strictObject({
  language: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/),
  app_environment: z.enum(["development", "preview", "production"]),
  event_schema_version: z.literal(ANALYTICS_EVENT_SCHEMA_VERSION),
  source: z.enum(ANALYTICS_EVENT_SOURCES),
});

export type AnalyticsPropertyValue = string | number | boolean;

export type ValidatedAnalyticsEvent =
  | { ok: true; properties: Record<string, AnalyticsPropertyValue> }
  | {
      ok: false;
      reason: "unknown_event" | "invalid_properties" | "invalid_context";
      /** Property paths only — never the values, which is what could be sensitive. */
      paths: string[];
    };

/**
 * Validates a pending event against its schema and the common properties and
 * returns exactly what may be sent — the single enforcement point for the
 * event-property allowlist. Anything off-list or out of bounds yields
 * `ok: false` and the caller drops the event.
 */
export function validateAnalyticsEvent(
  pending: PendingAnalyticsEvent,
  context: {
    languageCode: string;
    appEnvironment: "development" | "preview" | "production";
  },
): ValidatedAnalyticsEvent {
  // An own-property check, not a plain lookup: `constructor`, `toString` and
  // `__proto__` are "found" on any object, and an inherited function is not an
  // event definition.
  if (!Object.hasOwn(ANALYTICS_EVENTS, pending.event)) {
    return { ok: false, reason: "unknown_event", paths: [] };
  }
  const definition: EventDefinition = ANALYTICS_EVENTS[pending.event];

  const eventProperties = definition.properties.safeParse(pending.properties);
  if (!eventProperties.success) {
    return {
      ok: false,
      reason: "invalid_properties",
      paths: eventProperties.error.issues.map((issue) => issue.path.join(".")),
    };
  }

  const common = commonPropertiesSchema.safeParse({
    language: context.languageCode,
    app_environment: context.appEnvironment,
    event_schema_version: ANALYTICS_EVENT_SCHEMA_VERSION,
    source: pending.source,
  });
  if (!common.success) {
    return {
      ok: false,
      reason: "invalid_context",
      paths: common.error.issues.map((issue) => issue.path.join(".")),
    };
  }

  return {
    ok: true,
    properties: {
      ...common.data,
      ...(eventProperties.data as Record<string, AnalyticsPropertyValue>),
    },
  };
}
