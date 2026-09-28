import { z } from "zod";

/** Same permissive UUID-shape reasoning as `domains/admin/audit-schemas.ts` — this codebase's seeded fixture IDs don't satisfy `z.uuid()`'s stricter RFC 4122 version check. */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

/** Spec 25 §15's work-queue filter values — see `AdminCurriculumNeedsFilter`'s own docstring for what's deliberately absent. */
const needsFilterSchema = z.enum([
  "definition",
  "examples",
  "ipa",
  "pronunciation",
  "synonyms",
  "variations",
  "draft_changes",
  "ready_to_publish",
]);

/** Boundary validation for `getAdminCurriculumItems` (code-standards.md's "validate untrusted input at runtime" rule) — this query's filters/limit/cursor originate from admin-controlled URL search params. */
export const getAdminCurriculumItemsInputSchema = z.object({
  languageId: uuidLike,
  levelId: uuidLike.optional(),
  type: z.enum(["vocabulary", "grammar"]).optional(),
  status: z.enum(["draft", "pending", "published", "archived"]).optional(),
  groupId: uuidLike.optional(),
  search: z.string().trim().min(1).optional(),
  needs: needsFilterSchema.optional(),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().trim().min(1).nullish(),
});

/** Boundary validation for `getAdjacentAdminCurriculumItem` — the current item's own ordering key, plus the same filter shape above minus pagination. */
export const getAdjacentAdminCurriculumItemInputSchema = z.object({
  languageId: uuidLike,
  levelId: uuidLike.optional(),
  type: z.enum(["vocabulary", "grammar"]).optional(),
  status: z.enum(["draft", "pending", "published", "archived"]).optional(),
  groupId: uuidLike.optional(),
  search: z.string().trim().min(1).optional(),
  needs: needsFilterSchema.optional(),
  currentLevelNumber: z.number().int().min(1),
  currentPosition: z.number().int().min(0),
  currentId: uuidLike,
  direction: z.enum(["next", "previous"]),
  /** "Next Incomplete Item" (spec 25 §16) — the next/previous item matching *any* needs-flag, not one specific field. Mutually exclusive with `needs` in practice (the caller picks one), but nothing here enforces that — `anyIncomplete` simply wins if both are somehow set. */
  anyIncomplete: z.boolean().optional(),
});

/** Boundary validation for `getLevelContentSummary`. */
export const getLevelContentSummaryInputSchema = z.object({
  languageId: uuidLike,
  levelId: uuidLike,
});
