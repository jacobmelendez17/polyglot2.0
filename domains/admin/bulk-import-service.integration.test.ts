import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, ITEM_GATO_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { lockLearningItemForEdit } from "@/domains/curriculum/curriculum-mutation-repository";
import type { ParsedVocabularyFields, ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";

import { getAuditEvents } from "./audit-repository";
import { bulkImportVocabulary, previewVocabularyImport } from "./bulk-import-service";
import type { ImportRowDecision } from "./bulk-import-service";

function fields(overrides: Partial<ParsedVocabularyFields> & Pick<ParsedVocabularyFields, "term" | "primaryMeaning">): ParsedVocabularyFields {
  return { partOfSpeech: "noun", article: null, definition: null, pronunciation: null, ipa: null, context: null, creatorNotes: null, acceptedAnswers: [], ...overrides };
}

function validRow(rowNumber: number, term: string, primaryMeaning: string): ValidatedImportRow {
  return { rowNumber, raw: { term, primary_meaning: primaryMeaning, part_of_speech: "noun" }, fields: fields({ term, primaryMeaning }), fieldIssues: [] };
}

describe("previewVocabularyImport", () => {
  it("flags no issues for unique, well-formed rows", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [validRow(2, "perro", "dog"), validRow(3, "pajaro", "bird")] });

      expect(preview.every((row) => row.existingDuplicates.length === 0 && row.duplicateOfEarlierRow === null)).toBe(true);
    });
  });

  it("flags a row matching an existing curriculum item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [validRow(2, "gato", "cat (again)")] });

      expect(preview[0]!.existingDuplicates).toHaveLength(1);
      expect(preview[0]!.existingDuplicates[0]!.learningItemId).toBe(ITEM_GATO_ID);
    });
  });

  it("flags the second of two same-term rows in the same file, referencing the first row's number", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [validRow(2, "perro", "dog"), validRow(5, "PERRO", "dog again")] });

      expect(preview[0]!.duplicateOfEarlierRow).toBeNull();
      expect(preview[1]!.duplicateOfEarlierRow).toBe(2);
    });
  });

  it("passes field issues through unchanged for a row with no usable fields, without checking duplicates for it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const invalidRow: ValidatedImportRow = { rowNumber: 2, raw: { term: "", primary_meaning: "", part_of_speech: "" }, fields: null, fieldIssues: [{ field: "term", message: "Missing term." }] };
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [invalidRow] });

      expect(preview[0]).toEqual({ rowNumber: 2, raw: invalidRow.raw, fields: null, fieldIssues: invalidRow.fieldIssues, existingDuplicates: [], duplicateOfEarlierRow: null });
    });
  });
});

describe("bulkImportVocabulary", () => {
  it("creates a pending item per imported row, skips skipped rows, sharing one correlationId across the audit trail", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();
      const rows: ImportRowDecision[] = [
        { fields: fields({ term: "perro", primaryMeaning: "dog" }), decision: "import" },
        { fields: fields({ term: "gato_duplicate_skip_me", primaryMeaning: "should not be created" }), decision: "skip" },
        { fields: fields({ term: "pajaro", primaryMeaning: "bird" }), decision: "import" },
      ];

      const result = await bulkImportVocabulary(tx, { languageId, levelId: level1Id, vocabularyGroupId: vocabGroupId, actorUserId: DEVELOPER_ID, idempotencyKey, rows });

      expect(result.createdLearningItemIds).toHaveLength(2);
      for (const id of result.createdLearningItemIds) {
        const item = await lockLearningItemForEdit(tx, id);
        expect(item?.status).toBe("pending");
      }

      const audit = await getAuditEvents(tx, { action: "CURRICULUM_ITEM_CREATED", limit: 10 });
      const forThisBatch = audit.items.filter((e) => e.correlationId === idempotencyKey);
      expect(forThisBatch).toHaveLength(2);
    });
  });

  it("creates an imported row over a real duplicate anyway, recording DUPLICATE_APPROVED — the decision to import *is* the homonym approval", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      const result = await bulkImportVocabulary(tx, {
        languageId,
        levelId: level1Id,
        vocabularyGroupId: vocabGroupId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
        rows: [{ fields: fields({ term: "gato", primaryMeaning: "cat (deliberate homonym)" }), decision: "import" }],
      });

      expect(result.createdLearningItemIds).toHaveLength(1);
      const audit = await getAuditEvents(tx, { action: "DUPLICATE_APPROVED", limit: 10 });
      expect(audit.items.some((e) => e.correlationId === idempotencyKey && e.resourceId === result.createdLearningItemIds[0])).toBe(true);
    });
  });

  it("refuses to run when every row was skipped", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      await expect(
        bulkImportVocabulary(tx, {
          languageId,
          levelId: level1Id,
          vocabularyGroupId: vocabGroupId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [{ fields: fields({ term: "perro", primaryMeaning: "dog" }), decision: "skip" }],
        }),
      ).rejects.toThrow();
    });
  });

  it("assigns increasing positions within the target level, appended after whatever already exists there", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const result = await bulkImportVocabulary(tx, {
        languageId,
        levelId: level1Id,
        vocabularyGroupId: vocabGroupId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          { fields: fields({ term: "perro", primaryMeaning: "dog" }), decision: "import" },
          { fields: fields({ term: "pajaro", primaryMeaning: "bird" }), decision: "import" },
        ],
      });

      const [first, second] = await Promise.all(result.createdLearningItemIds.map((id) => lockLearningItemForEdit(tx, id)));
      expect(second!.position).toBe(first!.position + 1);
    });
  });
});
