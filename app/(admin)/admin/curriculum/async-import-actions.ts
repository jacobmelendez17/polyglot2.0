"use server";

import { z } from "zod";

import { canPublishCurriculum } from "@/domains/admin";
import {
  confirmCurriculumImport,
  createCurriculumImportUpload,
  getCurriculumImportStatus,
  listCurriculumImportRowsForReview,
  resolveCurriculumImportRow,
} from "@/domains/admin/server";
import type { CurriculumImportRecord, CurriculumImportRowsPage } from "@/domains/admin/server";
import { requireUser } from "@/domains/users/server";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Server Action entry points for spec 19's asynchronous curriculum import
 * (§48 steps 12-13). Kept in its own file rather than added to
 * `import-actions.ts` — that file's actions still drive the synchronous
 * path (§44's "Removal of Old Execution Path" is a later step, once this
 * one is verified end to end), and the two are genuinely different
 * workflows: this file never parses a CSV, previews a resolution, or
 * touches curriculum directly — it only creates an upload slot and reads
 * back whatever the Lambda pipeline (already verified in production,
 * see `progress-tracker.md`) has written.
 *
 * Follows `import-actions.ts`'s exact established shape independently
 * (this codebase deliberately keeps each action file's own auth wrapper
 * local) rather than sharing one: Zod-validated, re-authenticates and
 * re-checks `canPublishCurriculum` on every call.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

async function runAsyncImportAction<T>(fn: (actorUserId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canPublishCurriculum(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof AdminError) {
      return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "CURRICULUM_VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected async import action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const createInputSchema = z.object({
  languageId: z.string().min(1),
  originalFilename: z.string().trim().min(1).max(255),
  fileExtension: z.enum(["csv", "tsv"]),
});

export type CreateAsyncImportResult = { importId: string; uploadUrl: string };

/** Creates the import record and a short-lived presigned upload URL. The browser uploads directly to S3 from here — the file itself never passes through this action (spec 19 §6). */
export async function createAsyncCurriculumImportAction(input: z.infer<typeof createInputSchema>): Promise<ActionResult<CreateAsyncImportResult>> {
  return runAsyncImportAction(async (actorUserId) => {
    const parsed = createInputSchema.parse(input);
    return createCurriculumImportUpload({ ...parsed, actorUserId });
  });
}

const importIdSchema = z.object({ importId: z.string().uuid() });

/** Read-only polling target (spec 19 §38) — the Admin page calls this every few seconds while an import is processing, and stops once it reaches a terminal/user-action state. */
export async function getCurriculumImportStatusAction(input: z.infer<typeof importIdSchema>): Promise<ActionResult<CurriculumImportRecord | null>> {
  return runAsyncImportAction(async () => {
    const { importId } = importIdSchema.parse(input);
    return getCurriculumImportStatus(importId);
  });
}

const listRowsInputSchema = z.object({ importId: z.string().uuid(), cursor: z.string().nullish() });

export async function listCurriculumImportRowsAction(input: z.infer<typeof listRowsInputSchema>): Promise<ActionResult<CurriculumImportRowsPage>> {
  return runAsyncImportAction(async () => {
    const parsed = listRowsInputSchema.parse(input);
    return listCurriculumImportRowsForReview({ importId: parsed.importId, cursor: parsed.cursor, limit: 100 });
  });
}

const resolveRowInputSchema = z.object({ rowId: z.string().uuid() });

/** V1's only per-row disposition (spec 19 §9): skip a blocked row so it stops blocking confirmation. */
export async function resolveCurriculumImportRowAction(input: z.infer<typeof resolveRowInputSchema>): Promise<ActionResult<void>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { rowId } = resolveRowInputSchema.parse(input);
    await resolveCurriculumImportRow({ rowId, actorUserId });
  });
}

export async function confirmAsyncCurriculumImportAction(input: z.infer<typeof importIdSchema>): Promise<ActionResult<{ confirmedPreviewVersion: number }>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { importId } = importIdSchema.parse(input);
    return confirmCurriculumImport({ importId, actorUserId });
  });
}
