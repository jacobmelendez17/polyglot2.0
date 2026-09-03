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
};
