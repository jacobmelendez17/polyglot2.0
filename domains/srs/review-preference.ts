/**
 * The learner's Review Type/Hint/Review UI preferences, as pure values and
 * rules (spec 20 Reviews). Database-free on purpose, matching
 * `domains/users/curriculum-preference.ts`'s split between "what the values
 * are" (here) and "how a question is built/graded from one"
 * (`review-presentation.ts`, `review-hint.ts`, `review-queue.ts`).
 */

export const REVIEW_TYPES = ["cloze_manual", "cloze_flashcard", "flashcard"] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number];

/** The spec's own default — shown pre-selected in its mockup, listed first among the three options. */
export const DEFAULT_REVIEW_TYPE: ReviewType = "cloze_manual";

export function isReviewType(value: unknown): value is ReviewType {
  return typeof value === "string" && (REVIEW_TYPES as readonly string[]).includes(value);
}

/** Whether `reviewType` ever attempts a sentence-blank presentation at all (as opposed to Flashcard, which never does). */
export function isClozeReviewType(reviewType: ReviewType): boolean {
  return reviewType === "cloze_manual" || reviewType === "cloze_flashcard";
}

/** Spec 20 Review Hints. Only meaningful under Hint Mode "more" — the only mode with two separate pieces of content to reveal (see `review-hint.ts`). */
export const HINT_ORDERS = ["nuance_first", "translation_first"] as const;
export type HintOrder = (typeof HINT_ORDERS)[number];
export const DEFAULT_HINT_ORDER: HintOrder = "nuance_first";

export function isHintOrder(value: unknown): value is HintOrder {
  return typeof value === "string" && (HINT_ORDERS as readonly string[]).includes(value);
}

export const HINT_MODES = ["hide", "hint", "show", "more", "always_show_nuance"] as const;
export type HintMode = (typeof HINT_MODES)[number];
export const DEFAULT_HINT_MODE: HintMode = "hint";

export function isHintMode(value: unknown): value is HintMode {
  return typeof value === "string" && (HINT_MODES as readonly string[]).includes(value);
}

/** Spec 20 Review UI — Undo Action, for typed review answer fields. */
export const UNDO_ACTIONS = ["clear_last_character", "clear_all_characters"] as const;
export type UndoAction = (typeof UNDO_ACTIONS)[number];
export const DEFAULT_UNDO_ACTION: UndoAction = "clear_last_character";

export function isUndoAction(value: unknown): value is UndoAction {
  return typeof value === "string" && (UNDO_ACTIONS as readonly string[]).includes(value);
}

/**
 * Spec 20 SRS Strictness — which demotion rule applies to an incorrect
 * normal SRS result. `one_stage` is the spec's own stated default, and the
 * new Polyglot-wide default replacing the old WaniKani-inspired Beginner/
 * Familiar+ split outright (see `domains/srs/review-result.ts`).
 */
export const SRS_STRICTNESSES = ["one_stage", "two_stages", "three_stages", "half", "full"] as const;
export type SrsStrictness = (typeof SRS_STRICTNESSES)[number];
export const DEFAULT_SRS_STRICTNESS: SrsStrictness = "one_stage";

export function isSrsStrictness(value: unknown): value is SrsStrictness {
  return typeof value === "string" && (SRS_STRICTNESSES as readonly string[]).includes(value);
}

/**
 * Spec 20 SRS Interval — how far out a *correct* review's next due date
 * lands. `default` is the spec's own stated default. Unlike SRS Strictness,
 * this never affects an already-scheduled review's due time (the spec's own
 * "Important Future-Only Rule") — see `domains/srs/srs-config.ts`'s
 * `getConfiguredInterval`.
 */
export const SRS_INTERVAL_MODES = ["shortest", "shorter", "default", "longer", "longest"] as const;
export type SrsIntervalMode = (typeof SRS_INTERVAL_MODES)[number];
export const DEFAULT_SRS_INTERVAL_MODE: SrsIntervalMode = "default";

export function isSrsIntervalMode(value: unknown): value is SrsIntervalMode {
  return typeof value === "string" && (SRS_INTERVAL_MODES as readonly string[]).includes(value);
}

/**
 * Spec 20 Review Queue Timing — the final rounding step applied to a freshly
 * computed due time. `start_of_hour` is the spec's own stated default. One
 * value per language, not split grammar/vocabulary, unlike every other
 * Reviews setting so far — the spec's own "Language-Specific Settings" list
 * names it once. See `domains/srs/review-queue-timing.ts` for the rounding
 * logic itself.
 */
export const REVIEW_QUEUE_TIMING_MODES = ["start_of_hour", "start_of_day"] as const;
export type ReviewQueueTimingMode = (typeof REVIEW_QUEUE_TIMING_MODES)[number];
export const DEFAULT_REVIEW_QUEUE_TIMING_MODE: ReviewQueueTimingMode = "start_of_hour";

export function isReviewQueueTimingMode(value: unknown): value is ReviewQueueTimingMode {
  return typeof value === "string" && (REVIEW_QUEUE_TIMING_MODES as readonly string[]).includes(value);
}

/**
 * Spec 20 Review UI — the seven independent boolean toggle field names.
 * Database-free so the Settings UI (a client component) can reference the
 * field-name union without importing `review-preference-repository.ts`
 * (which touches `db/schema` and is server-only reachable through
 * `domains/srs/server.ts`, never the client-safe `domains/srs` barrel).
 */
export const REVIEW_UI_TOGGLE_FIELDS = [
  "autoplayAudio",
  "lightningMode",
  "focusMode",
  "autoHighlightErrors",
  "showSrsStage",
  "autoExpandInfo",
] as const;
export type ReviewUiToggleField = (typeof REVIEW_UI_TOGGLE_FIELDS)[number];

/**
 * This learner's review preferences for one language. Unlike
 * `LanguageSettings`, there is no "never chosen" state to represent — every
 * field always has a real value, defaulted at the effective-read layer
 * (`review-preference-repository.ts`'s `findReviewPreferences`) exactly like
 * `ContentPreferences`.
 */
export type ReviewPreferences = {
  userId: string;
  languageId: string;
  grammarReviewType: ReviewType;
  vocabularyReviewType: ReviewType;
  grammarHintOrder: HintOrder;
  vocabularyHintOrder: HintOrder;
  grammarHintMode: HintMode;
  vocabularyHintMode: HintMode;
  /** Spec 20 Review UI — Autoplay Audio. Separate from Lessons' Auto Pronunciation (spec 20 unit 9). */
  autoplayAudio: boolean;
  lightningMode: boolean;
  focusMode: boolean;
  autoHighlightErrors: boolean;
  showSrsStage: boolean;
  autoExpandInfo: boolean;
  undoAction: UndoAction;
  grammarSrsStrictness: SrsStrictness;
  vocabularySrsStrictness: SrsStrictness;
  grammarSrsIntervalMode: SrsIntervalMode;
  vocabularySrsIntervalMode: SrsIntervalMode;
  reviewQueueTiming: ReviewQueueTimingMode;
};

export const DEFAULT_REVIEW_PREFERENCES: Omit<ReviewPreferences, "userId" | "languageId"> = {
  grammarReviewType: DEFAULT_REVIEW_TYPE,
  vocabularyReviewType: DEFAULT_REVIEW_TYPE,
  grammarHintOrder: DEFAULT_HINT_ORDER,
  vocabularyHintOrder: DEFAULT_HINT_ORDER,
  grammarHintMode: DEFAULT_HINT_MODE,
  vocabularyHintMode: DEFAULT_HINT_MODE,
  autoplayAudio: true,
  lightningMode: false,
  focusMode: false,
  autoHighlightErrors: true,
  showSrsStage: true,
  autoExpandInfo: false,
  undoAction: DEFAULT_UNDO_ACTION,
  grammarSrsStrictness: DEFAULT_SRS_STRICTNESS,
  vocabularySrsStrictness: DEFAULT_SRS_STRICTNESS,
  grammarSrsIntervalMode: DEFAULT_SRS_INTERVAL_MODE,
  vocabularySrsIntervalMode: DEFAULT_SRS_INTERVAL_MODE,
  reviewQueueTiming: DEFAULT_REVIEW_QUEUE_TIMING_MODE,
};
