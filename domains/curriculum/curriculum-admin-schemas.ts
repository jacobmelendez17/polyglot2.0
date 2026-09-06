import { z } from "zod";

/** Same permissive UUID-shape reasoning as `domains/admin/audit-schemas.ts` — this codebase's seeded fixture IDs don't satisfy `z.uuid()`'s stricter RFC 4122 version check. */
const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

/** Boundary validation for `getAdminCurriculumItems` (code-standards.md's "validate untrusted input at runtime" rule) — this query's filters/limit/cursor originate from admin-controlled URL search params. */
export const getAdminCurriculumItemsInputSchema = z.object({
  languageId: uuidLike,
  levelId: uuidLike.optional(),
  type: z.enum(["vocabulary", "grammar"]).optional(),
  status: z.enum(["draft", "pending", "published", "archived"]).optional(),
  groupId: uuidLike.optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().trim().min(1).nullish(),
});
