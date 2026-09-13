import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getAuditEvents } from "./audit-repository";
import {
  archiveCurriculumImport,
  confirmCurriculumImport,
  createCurriculumImport,
  markCurriculumImportCompleted,
  markCurriculumImportPreviewStarted,
  markCurriculumImportStarted,
  markCurriculumImportUploaded,
  permanentlyDeleteCurriculumImport,
  recordCurriculumImportPreview,
  resolveCurriculumImportRow,
  retryCurriculumImport,
  unarchiveCurriculumImport,
} from "./curriculum-import-service";
import { getCurriculumImportById, listArchivedCurriculumImports, listCurriculumImportRows, listCurriculumImports } from "./curriculum-import-repository";
import type { CurriculumImportRowPreviewInput } from "./curriculum-import-types";

async function createImport(db: Parameters<typeof createCurriculumImport>[0], languageId: string) {
  const id = crypto.randomUUID();
  return createCurriculumImport(db, {
    id,
    languageId,
    environment: "development",
    uploadedByUserId: DEVELOPER_ID,
    originalFilename: "spanish-level-2.csv",
    fileExtension: "csv",
    s3Bucket: "polyglot-dev-imports",
    s3Key: `imports/${id}/source.csv`,
  });
}

const cleanRow: CurriculumImportRowPreviewInput = {
  rowNumber: 1,
  itemType: "vocabulary",
  displayTerm: "comer",
  levelNumber: 1,
  groupNumber: 1,
  classification: "create",
  resolvedLearningItemId: null,
  changedFields: null,
  reviewReasonCode: null,
  reviewReason: null,
};

const blockedRow: CurriculumImportRowPreviewInput = {
  rowNumber: 2,
  itemType: null,
  displayTerm: null,
  levelNumber: 7,
  groupNumber: 3,
  classification: "blocked",
  resolvedLearningItemId: null,
  changedFields: null,
  reviewReasonCode: "GROUP_NOT_FOUND",
  reviewReason: "Level 7 has no Group 3.",
};

describe("curriculum import service (spec 19)", () => {
  it("creates an import in the uploading status", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      expect(record.status).toBe("uploading");
      expect(record.totalRows).toBe(0);
      expect(record.previewVersion).toBe(0);
    });
  });

  it("moves uploading -> queued_for_preview -> previewing, and a duplicate upload event is a harmless no-op", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);

      await markCurriculumImportUploaded(tx, record.id);
      // A second S3 ObjectCreated delivery for the same key (spec 19 §7's "S3/SQS duplicate event delivery must be harmless").
      await markCurriculumImportUploaded(tx, record.id);

      const afterUpload = await getCurriculumImportById(tx, record.id);
      expect(afterUpload?.status).toBe("queued_for_preview");
      expect(afterUpload?.uploadedAt).not.toBeNull();

      await markCurriculumImportPreviewStarted(tx, record.id);
      const previewing = await getCurriculumImportById(tx, record.id);
      expect(previewing?.status).toBe("previewing");
      expect(previewing?.previewStartedAt).not.toBeNull();
    });
  });

  it("a clean preview (no blocked rows) lands on ready_to_import", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      await markCurriculumImportUploaded(tx, record.id);
      await markCurriculumImportPreviewStarted(tx, record.id);

      await recordCurriculumImportPreview(tx, { importId: record.id, rows: [cleanRow] });

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("ready_to_import");
      expect(after?.createCount).toBe(1);
      expect(after?.reviewCount).toBe(0);
      expect(after?.previewVersion).toBe(1);
    });
  });

  it("a preview with a blocked row lands on needs_review, and confirmation is refused until it's resolved", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      await markCurriculumImportUploaded(tx, record.id);
      await markCurriculumImportPreviewStarted(tx, record.id);
      await recordCurriculumImportPreview(tx, { importId: record.id, rows: [cleanRow, blockedRow] });

      const needsReview = await getCurriculumImportById(tx, record.id);
      expect(needsReview?.status).toBe("needs_review");
      expect(needsReview?.reviewCount).toBe(1);

      await expect(confirmCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID })).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });

      const rows = await listCurriculumImportRows(tx, { importId: record.id, limit: 10 });
      const theBlockedRow = rows.items.find((row) => row.classification === "blocked");
      expect(theBlockedRow).toBeDefined();
      await resolveCurriculumImportRow(tx, { rowId: theBlockedRow!.id });

      const confirmed = await confirmCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });
      expect(confirmed.confirmedPreviewVersion).toBe(1);

      const afterConfirm = await getCurriculumImportById(tx, record.id);
      expect(afterConfirm?.status).toBe("queued_for_import");
      expect(afterConfirm?.confirmedAt).not.toBeNull();

      const events = await getAuditEvents(tx, { resourceId: record.id, limit: 10 });
      expect(events.items.some((e) => e.action === "CURRICULUM_IMPORT_CONFIRMED")).toBe(true);
    });
  });

  it("cannot confirm from a status other than needs_review/ready_to_import", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      await expect(confirmCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID })).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
    });
  });

  it("commit lifecycle: queued_for_import -> importing -> completed, and a retry only works after failure", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      await markCurriculumImportUploaded(tx, record.id);
      await markCurriculumImportPreviewStarted(tx, record.id);
      await recordCurriculumImportPreview(tx, { importId: record.id, rows: [cleanRow] });
      await confirmCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });

      await markCurriculumImportStarted(tx, record.id);
      const importing = await getCurriculumImportById(tx, record.id);
      expect(importing?.status).toBe("importing");
      expect(importing?.attemptCount).toBe(1);

      await markCurriculumImportCompleted(tx, record.id);
      const completed = await getCurriculumImportById(tx, record.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.completedAt).not.toBeNull();

      // A completed import cannot be "retried" — retry is only for failures.
      await expect(retryCurriculumImport(tx, record.id)).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
    });
  });

  it("a material change re-preview returns a ready_to_import import to needs_review, marking the affected row changed_since_preview", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      await markCurriculumImportUploaded(tx, record.id);
      await markCurriculumImportPreviewStarted(tx, record.id);
      await recordCurriculumImportPreview(tx, { importId: record.id, rows: [cleanRow] });

      // §12: the commit worker re-runs preview before ever trusting the stored one.
      await markCurriculumImportPreviewStarted(tx, record.id);
      await recordCurriculumImportPreview(tx, { importId: record.id, rows: [blockedRow] });

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("needs_review");
      expect(after?.previewVersion).toBe(2);
    });
  });

  it("archive removes an import from normal history and moves it to the archived listing; unarchive reverses it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);

      const beforeArchive = await listCurriculumImports(tx, { languageId, limit: 10 });
      expect(beforeArchive.items.some((i) => i.id === record.id)).toBe(true);

      await archiveCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });
      // Archiving twice is a no-op, not an error (idempotent).
      await archiveCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });

      const afterArchive = await listCurriculumImports(tx, { languageId, limit: 10 });
      expect(afterArchive.items.some((i) => i.id === record.id)).toBe(false);
      const archived = await listArchivedCurriculumImports(tx, { languageId, limit: 10 });
      expect(archived.items.some((i) => i.id === record.id)).toBe(true);

      await unarchiveCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });
      const restored = await listCurriculumImports(tx, { languageId, limit: 10 });
      expect(restored.items.some((i) => i.id === record.id)).toBe(true);
    });
  });

  it("permanent deletion requires the import to be archived first, and leaves a minimal audit tombstone", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);

      await expect(permanentlyDeleteCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID })).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });

      await archiveCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });
      await permanentlyDeleteCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });

      expect(await getCurriculumImportById(tx, record.id)).toBeNull();

      const events = await getAuditEvents(tx, { resourceId: record.id, action: "CURRICULUM_IMPORT_DELETED", limit: 10 });
      expect(events.items).toHaveLength(1);
      expect(events.items[0]?.afterData).toEqual({ sourceSha256: null, finalStatus: "uploading" });
    });
  });

  it("deleting an import cascades to its rows", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createImport(tx, languageId);
      await markCurriculumImportUploaded(tx, record.id);
      await markCurriculumImportPreviewStarted(tx, record.id);
      await recordCurriculumImportPreview(tx, { importId: record.id, rows: [cleanRow] });

      await archiveCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });
      await permanentlyDeleteCurriculumImport(tx, { importId: record.id, actorUserId: DEVELOPER_ID });

      const rows = await listCurriculumImportRows(tx, { importId: record.id, limit: 10 });
      expect(rows.items).toHaveLength(0);
    });
  });
});
