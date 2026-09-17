"use server";

import { z } from "zod";

import { canPublishCurriculum } from "@/domains/admin";
import {
  archiveCurriculumImport,
  confirmCurriculumImport,
  createCurriculumImportUpload,
  getCurriculumImportStatus,
  listActiveCurriculumImports,
  listArchivedCurriculumImportsForHistory,
  listCurriculumImportRowsForReview,
  permanentlyDeleteCurriculumImport,
  resolveCurriculumImportRow,
  retryCurriculumImport,
  unarchiveCurriculumImport,
} from "@/domains/admin/server";
import type {
  CurriculumImportRecord,
  CurriculumImportRowsPage,
  CurriculumImportsPage,
} from "@/domains/admin/server";
import { requireUser } from "@/domains/users/server";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Server Action entry points for spec 19's asynchronous curriculum import
 * (§48 steps 12-13) — now the only curriculum-import execution path; the
 * old synchronous Server Actions and dialog were removed once this one was
 * fully verified end to end (§44's "Removal of Old Execution Path", §48
 * step 22). This file never parses a CSV, previews a resolution, or
 * touches curriculum directly — it only creates an upload slot and reads
 * back whatever the Lambda pipeline (verified against real AWS, see
 * `progress-tracker.md`) has written. `bulk-import-service.ts` and the
 * parsers/validators it depends on are still very much alive: the Lambda's
 * `commit-job.ts` and `scripts/curriculum-import.ts` both call them
 * directly.
 *
 * Zod-validated, re-authenticates and re-checks `canPublishCurriculum` on
 * every call, matching this codebase's per-workflow action-file shape.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

async function runAsyncImportAction<T>(
  fn: (actorUserId: string) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canPublishCurriculum(user)) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "You don't have access to do that.",
        },
      };
    }
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof AdminError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "CURRICULUM_VALIDATION_FAILED",
          message: "That request could not be understood.",
        },
      };
    }
    console.error("Unexpected async import action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

const createInputSchema = z.object({
  languageId: z.string().min(1),
  originalFilename: z.string().trim().min(1).max(255),
  fileExtension: z.enum(["csv", "tsv"]),
});

export type CreateAsyncImportResult = { importId: string; uploadUrl: string };

/** Creates the import record and a short-lived presigned upload URL. The browser uploads directly to S3 from here — the file itself never passes through this action (spec 19 §6). */
export async function createAsyncCurriculumImportAction(
  input: z.infer<typeof createInputSchema>,
): Promise<ActionResult<CreateAsyncImportResult>> {
  return runAsyncImportAction(async (actorUserId) => {
    const parsed = createInputSchema.parse(input);
    return createCurriculumImportUpload({ ...parsed, actorUserId });
  });
}

const importIdSchema = z.object({ importId: z.string().uuid() });

/** Read-only polling target (spec 19 §38) — the Admin page calls this every few seconds while an import is processing, and stops once it reaches a terminal/user-action state. */
export async function getCurriculumImportStatusAction(
  input: z.infer<typeof importIdSchema>,
): Promise<ActionResult<CurriculumImportRecord | null>> {
  return runAsyncImportAction(async () => {
    const { importId } = importIdSchema.parse(input);
    return getCurriculumImportStatus(importId);
  });
}

const listRowsInputSchema = z.object({
  importId: z.string().uuid(),
  cursor: z.string().nullish(),
});

export async function listCurriculumImportRowsAction(
  input: z.infer<typeof listRowsInputSchema>,
): Promise<ActionResult<CurriculumImportRowsPage>> {
  return runAsyncImportAction(async () => {
    const parsed = listRowsInputSchema.parse(input);
    return listCurriculumImportRowsForReview({
      importId: parsed.importId,
      cursor: parsed.cursor,
      limit: 100,
    });
  });
}

const resolveRowInputSchema = z.object({ rowId: z.string().uuid() });

/** V1's only per-row disposition (spec 19 §9): skip a blocked row so it stops blocking confirmation. */
export async function resolveCurriculumImportRowAction(
  input: z.infer<typeof resolveRowInputSchema>,
): Promise<ActionResult<void>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { rowId } = resolveRowInputSchema.parse(input);
    await resolveCurriculumImportRow({ rowId, actorUserId });
  });
}

export async function confirmAsyncCurriculumImportAction(
  input: z.infer<typeof importIdSchema>,
): Promise<ActionResult<{ confirmedPreviewVersion: number }>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { importId } = importIdSchema.parse(input);
    return confirmCurriculumImport({ importId, actorUserId });
  });
}

/** Spec 19 §22 — retries a `failed` import: moves it back to `queued_for_import` and re-sends the commit message. */
export async function retryAsyncCurriculumImportAction(
  input: z.infer<typeof importIdSchema>,
): Promise<ActionResult<void>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { importId } = importIdSchema.parse(input);
    await retryCurriculumImport({ importId, actorUserId });
  });
}

const listImportsInputSchema = z.object({
  languageId: z.string().min(1),
  cursor: z.string().nullish(),
});

/** Spec 19 §19 — normal (non-archived) import history, newest first. */
export async function listCurriculumImportsAction(
  input: z.infer<typeof listImportsInputSchema>,
): Promise<ActionResult<CurriculumImportsPage>> {
  return runAsyncImportAction(async () => {
    const parsed = listImportsInputSchema.parse(input);
    return listActiveCurriculumImports({
      languageId: parsed.languageId,
      cursor: parsed.cursor,
      limit: 20,
    });
  });
}

/** Spec 19 §25 — archived import history. */
export async function listArchivedCurriculumImportsAction(
  input: z.infer<typeof listImportsInputSchema>,
): Promise<ActionResult<CurriculumImportsPage>> {
  return runAsyncImportAction(async () => {
    const parsed = listImportsInputSchema.parse(input);
    return listArchivedCurriculumImportsForHistory({
      languageId: parsed.languageId,
      cursor: parsed.cursor,
      limit: 20,
    });
  });
}

/** Spec 19 §25 — removes the import from normal history; never touches curriculum. */
export async function archiveCurriculumImportAction(
  input: z.infer<typeof importIdSchema>,
): Promise<ActionResult<void>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { importId } = importIdSchema.parse(input);
    await archiveCurriculumImport({ importId, actorUserId });
  });
}

export async function unarchiveCurriculumImportAction(
  input: z.infer<typeof importIdSchema>,
): Promise<ActionResult<void>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { importId } = importIdSchema.parse(input);
    await unarchiveCurriculumImport({ importId, actorUserId });
  });
}

const permanentDeleteInputSchema = z.object({
  importId: z.string().uuid(),
  confirmation: z.literal("DELETE"),
});

/**
 * Spec 19 §26 — requires the caller to have typed "DELETE" (the same strong
 * confirmation the UI itself renders); this action re-validates it rather
 * than trusting that the UI enforced it, matching the boundary-validation
 * rule for every other destructive admin action in this codebase.
 */
export async function permanentlyDeleteCurriculumImportAction(
  input: z.infer<typeof permanentDeleteInputSchema>,
): Promise<ActionResult<void>> {
  return runAsyncImportAction(async (actorUserId) => {
    const { importId } = permanentDeleteInputSchema.parse(input);
    await permanentlyDeleteCurriculumImport({ importId, actorUserId });
  });
}
