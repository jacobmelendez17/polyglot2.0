/**
 * What the browser may report to the server about its own session (spec 27 §6.1
 * "browser intent" events): that a session began. Deliberately nothing else — no
 * counts, no content, no level — so there is nothing for a client to misreport
 * but the session's own random id, which only correlates a start with its
 * completion. Types only, so the client can use it.
 */
export type AnalyticsIntent =
  | { event: "onboarding_started" }
  | { event: "lesson_started"; sessionKey: string }
  | { event: "review_session_started"; sessionKey: string };
