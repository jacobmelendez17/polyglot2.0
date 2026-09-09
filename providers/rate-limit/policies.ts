import type { RateLimitPolicy, RateLimitPolicyName } from "./types";

/**
 * Named, centralized rate-limit policies (spec 08 §54). Call sites reference
 * a policy by name — never raw window/count numbers. `lesson-complete` is
 * the policy spec 07 unit 6 will consume once it exists; add further
 * policies here as their real consumers land, not speculatively ahead of them.
 */
export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  "lesson-complete": {
    windowSeconds: 60,
    maxRequests: 5,
    failOpen: false,
  },
  // Spec 09 §13 — every authoritative review submission (each question
  // answered, not just each item completed) goes through this. Generous
  // enough for real interactive keyboard-driven use (spec 09 §16's "Enter
  // remains the primary review hotkey" implies rapid consecutive
  // submissions are normal, unlike a once-per-lesson completion), while
  // still bounding abuse. Fails closed like every other progress-affecting
  // mutation (spec 09 §13's explicit requirement).
  "review-submit": {
    windowSeconds: 60,
    maxRequests: 60,
    failOpen: false,
  },
  // Spec 11 (rewrite) — ordinary Admin mutations (create/edit/save-draft/
  // move/reorder/archive/delete/duplicate-resolution). Generous for real
  // interactive editing, still bounded against a compromised session
  // (architecture.md's "blast-radius containment" rationale).
  "admin-mutation": {
    windowSeconds: 60,
    maxRequests: 30,
    failOpen: false,
  },
  // Publishing (including bulk publish) is the highest-impact Admin
  // mutation — it's what actually changes what learners see — so it gets
  // its own, tighter policy rather than sharing "admin-mutation"'s budget.
  "admin-publish": {
    windowSeconds: 60,
    maxRequests: 10,
    failOpen: false,
  },
  "sandbox-mutation": {
    windowSeconds: 60,
    maxRequests: 30,
    failOpen: false,
  },
  // Spec 14 — learner-owned deck writes (create/rename/add/remove/reorder/
  // delete). Deck content is not learning progress, but it is still
  // user-owned data a compromised session could churn, so it is bounded on
  // the same "blast-radius containment" reasoning as the admin policies.
  "deck-mutation": {
    windowSeconds: 60,
    maxRequests: 30,
    failOpen: false,
  },
  // Spec 14 — one graded deck-practice answer. Sized like "review-submit"
  // because the interaction is the same shape: rapid consecutive
  // keyboard-driven submissions are normal. Fails closed to match every
  // other policy here; a practice session is supplementary, so refusing it
  // while the limiter is unreachable costs the learner no progress.
  "deck-practice-answer": {
    windowSeconds: 60,
    maxRequests: 60,
    failOpen: false,
  },
  // Spec 15 — finishing onboarding. A learner does this once, so the limit
  // only needs to be generous enough to absorb a double-click and a retry.
  // Fails closed like every other policy here; the underlying write is
  // already exactly-once, so a refusal costs nothing but a retry.
  "onboarding-complete": {
    windowSeconds: 60,
    maxRequests: 10,
    failOpen: false,
  },
  // Spec 16 — choosing or changing the curriculum mode (and the Theme
  // mode's selected theme). Not progress-affecting: it writes one settings
  // row and can never touch SRS state or unlocks. Still bounded on the same
  // "blast-radius containment" reasoning as "deck-mutation", and still
  // fails closed, since a refused preference change costs a retry and
  // nothing else.
  "curriculum-preference": {
    windowSeconds: 60,
    maxRequests: 20,
    failOpen: false,
  },
};
