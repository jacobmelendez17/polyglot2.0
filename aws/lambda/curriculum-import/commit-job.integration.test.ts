import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  DEVELOPER_ID,
  FIXTURE_LEVEL_NUMBER,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  learningItems,
  lexicalSources,
  vocabularyDictionaryMappings,
  vocabularyItems,
} from "@/db/schema";
import { bulkImportVocabulary } from "@/domains/admin/bulk-import-service";
import {
  confirmCurriculumImport,
  createCurriculumImport,
  resolveCurriculumImportRow,
} from "@/domains/admin/curriculum-import-service";
import {
  getCurriculumImportById,
  listCurriculumImportRows,
} from "@/domains/admin/curriculum-import-repository";
import {
  LEXICAL_SOURCE_DEFINITIONS,
  WIKTIONARY_ES_SOURCE_CODE,
} from "@/domains/lexicon/lexical-source-registry";
import { curriculumImportObjectKey } from "@/providers/storage/curriculum-import-object-key";
import type {
  CurriculumImportStorage,
  PresignedUpload,
} from "@/providers/storage/types";

import { runCommitJob } from "./commit-job";
import { runPreviewJob } from "./preview-job";

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

type TestTx = Parameters<typeof createCurriculumImport>[0];

async function createAndPreview(tx: TestTx, languageId: string, csv: string) {
  const id = crypto.randomUUID();
  const key = curriculumImportObjectKey(id, "csv");
  const record = await createCurriculumImport(tx, {
    id,
    languageId,
    environment: "development",
    uploadedByUserId: DEVELOPER_ID,
    originalFilename: "commit-test.csv",
    fileExtension: "csv",
    s3Bucket: "fake-bucket",
    s3Key: key,
  });

  const objects = new Map([[key, csv]]);
  const storage = new FakeCurriculumImportStorage(objects);
  await runPreviewJob(tx, storage, { bucket: "fake-bucket", key });

  return { importId: record.id, storage: () => storage };
}

describe("runCommitJob (spec 19 §11/§12/§14/§15)", () => {
  it("commits a clean, unresolved-free import and creates the vocabulary item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      // Post-commit dictionary matching (spec 19 §17) fails loudly and is
      // swallowed when no dictionary source has ever been imported for the
      // language (domains/lexicon/lexicon-mapping-service.ts's
      // resolveDictionarySourceId) — real on a shared dev branch that
      // happens to already have one, but not on an isolated test database
      // (spec 22's "remove shared-database assumptions"). Seed the minimal
      // real source row so matching actually runs and records an outcome.
      await tx
        .insert(lexicalSources)
        .values(LEXICAL_SOURCE_DEFINITIONS[WIKTIONARY_ES_SOURCE_CODE]!);
      const csv = `word,translation,level,group\ncommitcreate,commit create,${LEVEL_NUMBER},${GROUP_NUMBER}\n`;
      const { importId, storage } = await createAndPreview(tx, languageId, csv);

      const before = await getCurriculumImportById(tx, importId);
      expect(before?.status).toBe("ready_to_import");

      await confirmCurriculumImport(tx, {
        importId,
        actorUserId: DEVELOPER_ID,
      });
      await runCommitJob(tx, () => storage(), {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      const after = await getCurriculumImportById(tx, importId);
      expect(after?.status).toBe("completed");
      expect(after?.attemptCount).toBe(1);

      const [created] = await tx
        .select({ id: learningItems.id, term: vocabularyItems.term })
        .from(learningItems)
        .innerJoin(
          vocabularyItems,
          eq(vocabularyItems.learningItemId, learningItems.id),
        )
        .where(eq(vocabularyItems.term, "commitcreate"));
      expect(created).toBeDefined();

      // Spec 19 §17 — dictionary matching runs after a successful commit,
      // vocabulary only, exactly like the synchronous path. Whatever the
      // real match outcome is for this made-up term (almost certainly
      // "unmatched" against the fixture dictionary data), the point is that
      // a mapping attempt was recorded at all.
      const mappings = await tx
        .select()
        .from(vocabularyDictionaryMappings)
        .where(eq(vocabularyDictionaryMappings.vocabularyItemId, created!.id));
      expect(mappings.length).toBeGreaterThan(0);
    });
  });

  it("excludes a skipped row from the commit but still completes", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const csv =
        `word,translation,level,group\n` +
        `commitskip,commit skip,999999,1\n` +
        `commitkeep,commit keep,${LEVEL_NUMBER},${GROUP_NUMBER}\n`;
      const { importId, storage } = await createAndPreview(tx, languageId, csv);

      const rows = await listCurriculumImportRows(tx, { importId, limit: 10 });
      const blockedRow = rows.items.find(
        (row) => row.classification === "blocked",
      );
      expect(blockedRow).toBeDefined();
      await resolveCurriculumImportRow(tx, { rowId: blockedRow!.id });

      await confirmCurriculumImport(tx, {
        importId,
        actorUserId: DEVELOPER_ID,
      });
      await runCommitJob(tx, () => storage(), {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      const after = await getCurriculumImportById(tx, importId);
      expect(after?.status).toBe("completed");
      expect(after?.skippedCount).toBe(1);

      const [kept] = await tx
        .select({ id: vocabularyItems.term })
        .from(vocabularyItems)
        .where(eq(vocabularyItems.term, "commitkeep"));
      expect(kept).toBeDefined();
      const skipped = await tx
        .select({ id: vocabularyItems.term })
        .from(vocabularyItems)
        .where(eq(vocabularyItems.term, "commitskip"));
      expect(skipped).toHaveLength(0);
    });
  });

  it("aborts the commit and returns to review when the row set materially changed since preview (spec 19 §12/§13)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const csv = `word,translation,level,group\nmaterialchange,material change,${LEVEL_NUMBER},${GROUP_NUMBER}\n`;
      const { importId, storage } = await createAndPreview(tx, languageId, csv);

      const beforeConfirm = await getCurriculumImportById(tx, importId);
      expect(beforeConfirm?.status).toBe("ready_to_import");
      await confirmCurriculumImport(tx, {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      // An admin creates the exact same term directly, out from under the
      // confirmed import — the fresh resolution will now see an existing
      // match instead of "create" (spec 19 §12's own worked example).
      await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            decision: "import",
            fields: {
              itemType: "vocabulary",
              levelNumber: LEVEL_NUMBER,
              groupNumber: GROUP_NUMBER,
              term: "materialchange",
              primaryMeaning: "an admin got here first",
              partOfSpeech: "noun",
              article: null,
              definition: null,
              pronunciation: null,
              ipa: null,
              context: null,
              creatorNotes: null,
              acceptedAnswers: [],
            },
          },
        ],
      });

      await runCommitJob(tx, () => storage(), {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      const after = await getCurriculumImportById(tx, importId);
      // Back to review, not committed and not failed.
      expect(["needs_review", "ready_to_import"]).toContain(after?.status);
      expect(after?.previewVersion).toBe(2);

      const rows = await listCurriculumImportRows(tx, { importId, limit: 10 });
      expect(rows.items[0]?.classification).toBe("update"); // no longer "create"
      expect(rows.items[0]?.changedSincePreview).toBe(true);
    });
  });

  it("a duplicate commit message for an already-completed import is a harmless no-op", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const csv = `word,translation,level,group\ncommitduplicate,commit duplicate,${LEVEL_NUMBER},${GROUP_NUMBER}\n`;
      const { importId, storage } = await createAndPreview(tx, languageId, csv);

      await confirmCurriculumImport(tx, {
        importId,
        actorUserId: DEVELOPER_ID,
      });
      await runCommitJob(tx, () => storage(), {
        importId,
        actorUserId: DEVELOPER_ID,
      });
      // A second delivery of the exact same COMMIT_IMPORT message.
      await runCommitJob(tx, () => storage(), {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      const after = await getCurriculumImportById(tx, importId);
      expect(after?.status).toBe("completed");
      expect(after?.attemptCount).toBe(1); // only the first delivery actually ran the commit

      const matches = await tx
        .select({ id: vocabularyItems.term })
        .from(vocabularyItems)
        .where(eq(vocabularyItems.term, "commitduplicate"));
      expect(matches).toHaveLength(1); // not duplicated
    });
  });

  it("a retried commit after a transient failure is allowed to proceed (spec 19 §22)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const csv = `word,translation,level,group\ncommitretry,commit retry,${LEVEL_NUMBER},${GROUP_NUMBER}\n`;
      const { importId, storage } = await createAndPreview(tx, languageId, csv);
      await confirmCurriculumImport(tx, {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      // Simulate a failed first attempt: a storage that always throws.
      const failingStorage: CurriculumImportStorage = {
        bucketName: "fake-bucket",
        createPresignedUploadUrl: () => {
          throw new Error("unused");
        },
        deleteObject: async () => {},
        getObjectText: async () => {
          throw new Error("simulated transient S3 failure");
        },
      };
      await expect(
        runCommitJob(tx, () => failingStorage, {
          importId,
          actorUserId: DEVELOPER_ID,
        }),
      ).rejects.toThrow(/simulated transient/);

      const afterFailure = await getCurriculumImportById(tx, importId);
      expect(afterFailure?.status).toBe("failed");

      // SQS redelivers the identical message — must actually retry, not no-op.
      await runCommitJob(tx, () => storage(), {
        importId,
        actorUserId: DEVELOPER_ID,
      });

      const afterRetry = await getCurriculumImportById(tx, importId);
      expect(afterRetry?.status).toBe("completed");
      // Only 1, not 2: the failed attempt threw before ever reaching
      // markCurriculumImportStarted (the file read itself failed), so only
      // the successful retry actually incremented attempt_count.
      expect(afterRetry?.attemptCount).toBe(1);
    });
  });
});
