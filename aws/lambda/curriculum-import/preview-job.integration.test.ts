import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, FIXTURE_LEVEL_NUMBER, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { createCurriculumImport } from "@/domains/admin/curriculum-import-service";
import { getCurriculumImportById, listCurriculumImportRows } from "@/domains/admin/curriculum-import-repository";
import type { CurriculumImportStorage, PresignedUpload } from "@/providers/storage/types";

import { curriculumImportObjectKey } from "@/providers/storage/curriculum-import-object-key";
import { runPreviewJob } from "./preview-job";

/** An in-memory fake of the storage boundary — this test verifies the real state machine and the real `bulk-import-service.ts` resolver against a real database, without needing real AWS credentials to do it (spec 19's own tiering: this is the "DbClient-injectable domain logic" tier, not the "real AWS" tier `s3-curriculum-import-storage.integration.test.ts` already covers separately). */
class FakeCurriculumImportStorage implements CurriculumImportStorage {
  readonly bucketName = "fake-bucket";
  constructor(private readonly objects: Map<string, string>) {}

  async createPresignedUploadUrl(): Promise<PresignedUpload> {
    throw new Error("Not needed by this test.");
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async getObjectText(key: string): Promise<string> {
    const content = this.objects.get(key);
    if (content === undefined) throw new Error(`NoSuchKey: ${key}`);
    return content;
  }
}

const LEVEL_NUMBER = FIXTURE_LEVEL_NUMBER;
const GROUP_NUMBER = 1;

describe("runPreviewJob (spec 19 §7/§10)", () => {
  it("a clean CSV moves the import to ready_to_import with a create row recorded", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createCurriculumImport(tx, {
        languageId,
        environment: "development",
        uploadedByUserId: DEVELOPER_ID,
        originalFilename: "level-2.csv",
        fileExtension: "csv",
        s3Bucket: "fake-bucket",
        s3Key: "placeholder", // the real key (derived from record.id) isn't known until after creation
        sourceSha256: "sha",
      });

      const key = curriculumImportObjectKey(record.id, "csv");
      const objects = new Map([[key, `word,translation,level,group\ncomer,to eat,${LEVEL_NUMBER},${GROUP_NUMBER}\n`]]);
      const storage = new FakeCurriculumImportStorage(objects);

      await runPreviewJob(tx, storage, { bucket: "fake-bucket", key });

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("ready_to_import");
      expect(after?.createCount).toBe(1);
      expect(after?.previewVersion).toBe(1);
      expect(after?.uploadedAt).not.toBeNull();
      expect(after?.previewStartedAt).not.toBeNull();

      const rows = await listCurriculumImportRows(tx, { importId: record.id, limit: 10 });
      expect(rows.items).toHaveLength(1);
      expect(rows.items[0]).toMatchObject({ classification: "create", displayTerm: "comer" });
    });
  });

  it("a row referencing a nonexistent group moves the import to needs_review", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createCurriculumImport(tx, {
        languageId,
        environment: "development",
        uploadedByUserId: DEVELOPER_ID,
        originalFilename: "level-2.csv",
        fileExtension: "csv",
        s3Bucket: "fake-bucket",
        s3Key: "placeholder",
        sourceSha256: "sha",
      });

      const key = curriculumImportObjectKey(record.id, "csv");
      const objects = new Map([[key, `word,translation,level,group\nbanco,bank,${LEVEL_NUMBER},99\n`]]);
      const storage = new FakeCurriculumImportStorage(objects);

      await runPreviewJob(tx, storage, { bucket: "fake-bucket", key });

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("needs_review");
      expect(after?.reviewCount).toBe(1);

      const rows = await listCurriculumImportRows(tx, { importId: record.id, limit: 10 });
      expect(rows.items[0]).toMatchObject({ classification: "blocked", reviewReasonCode: "INVALID_ROW" });
    });
  });

  it("a CSV missing required columns marks the import failed with IMPORT_PARSE_FAILED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createCurriculumImport(tx, {
        languageId,
        environment: "development",
        uploadedByUserId: DEVELOPER_ID,
        originalFilename: "broken.csv",
        fileExtension: "csv",
        s3Bucket: "fake-bucket",
        s3Key: "placeholder",
        sourceSha256: "sha",
      });

      const key = curriculumImportObjectKey(record.id, "csv");
      const objects = new Map([[key, "word,translation\ncomer,to eat\n"]]);
      const storage = new FakeCurriculumImportStorage(objects);

      await expect(runPreviewJob(tx, storage, { bucket: "fake-bucket", key })).rejects.toBeInstanceOf(Error);

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("failed");
      expect(after?.lastErrorCode).toBe("IMPORT_PARSE_FAILED");
    });
  });

  it("a missing S3 object marks the import failed and rethrows", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createCurriculumImport(tx, {
        languageId,
        environment: "development",
        uploadedByUserId: DEVELOPER_ID,
        originalFilename: "gone.csv",
        fileExtension: "csv",
        s3Bucket: "fake-bucket",
        s3Key: "placeholder",
        sourceSha256: "sha",
      });

      const key = curriculumImportObjectKey(record.id, "csv");
      const storage = new FakeCurriculumImportStorage(new Map()); // no object uploaded

      await expect(runPreviewJob(tx, storage, { bucket: "fake-bucket", key })).rejects.toThrow(/NoSuchKey/);

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("failed");
    });
  });

  it("a duplicate delivery of the same preview job is harmless (spec 19 §7)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const record = await createCurriculumImport(tx, {
        languageId,
        environment: "development",
        uploadedByUserId: DEVELOPER_ID,
        originalFilename: "level-2.csv",
        fileExtension: "csv",
        s3Bucket: "fake-bucket",
        s3Key: "placeholder",
        sourceSha256: "sha",
      });

      const key = curriculumImportObjectKey(record.id, "csv");
      const objects = new Map([[key, `word,translation,level,group\ncomer,to eat,${LEVEL_NUMBER},${GROUP_NUMBER}\n`]]);
      const storage = new FakeCurriculumImportStorage(objects);

      await runPreviewJob(tx, storage, { bucket: "fake-bucket", key });
      // A second SQS delivery of the exact same S3 event.
      await runPreviewJob(tx, storage, { bucket: "fake-bucket", key });

      const after = await getCurriculumImportById(tx, record.id);
      expect(after?.status).toBe("ready_to_import");
      expect(after?.previewVersion).toBe(2); // re-ran, not a strict no-op — see preview-job.ts's docstring
      expect(after?.createCount).toBe(1);

      const rows = await listCurriculumImportRows(tx, { importId: record.id, limit: 10 });
      expect(rows.items).toHaveLength(1); // replaced, not duplicated
    });
  });
});
