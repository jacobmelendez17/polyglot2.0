/**
 * Client-safe public surface for `domains/danger-zone`: types and pure
 * option data only, safe to value-import from a `"use client"` component
 * (the reset dropdowns). The actual mutations live in `./server.ts`.
 */
export {
  CEFR_LEVELS,
  isCefrLevel,
  isResetTarget,
  RESET_TARGET_LABELS,
  RESET_TARGETS,
} from "./reset-types";
export type { ContentTypeResetResult, ResetTarget } from "./reset-types";
