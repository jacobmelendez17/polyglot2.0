import type { CefrLevel } from "@/db/schema";

/**
 * Spec 20 Danger Zone — "Reset Grammar"/"Reset Vocabulary" share one
 * dropdown shape: three named reset behaviors (Main/Ghost/Leech Reviews)
 * plus every CEFR band as its own option. Kept as one closed union rather
 * than two separate fields, matching the spec's own single-dropdown mockup.
 */
export const CEFR_LEVELS: readonly CefrLevel[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

export type ResetTarget = "main" | "ghost" | "leech" | CefrLevel;

export const RESET_TARGETS: readonly ResetTarget[] = [
  "main",
  "ghost",
  "leech",
  ...CEFR_LEVELS,
] as const;

export const RESET_TARGET_LABELS: Record<ResetTarget, string> = {
  main: "Main Reviews",
  ghost: "Ghost Reviews",
  leech: "Leech Reviews",
  A1: "A1",
  A2: "A2",
  B1: "B1",
  B2: "B2",
  C1: "C1",
  C2: "C2",
};

export function isCefrLevel(value: string): value is CefrLevel {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}

export function isResetTarget(value: string): value is ResetTarget {
  return (
    value === "main" ||
    value === "ghost" ||
    value === "leech" ||
    isCefrLevel(value)
  );
}

export type ContentTypeResetResult = { affectedItemCount: number };
