import { describe, expect, it } from "vitest";

import { DEVELOPER_ID, ITEM_GATO_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { lockLearningItemForEdit } from "@/domains/curriculum/curriculum-mutation-repository";
import { GRAMMAR_GROUP_NUMBER } from "@/domains/curriculum/vocabulary-import-parsing";
import type { ParsedGrammarFields, ParsedVocabularyFields, ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";

import { getAuditEvents } from "./audit-repository";
import { bulkImportVocabulary, previewVocabularyImport } from "./bulk-import-service";
import type { ImportRowDecision } from "./bulk-import-service";

// Level 1 (levelNumber 1) is `seedTestFixtures`' seeded level, with exactly
// one vocabulary group at position 1 (`vocabGroupId`). Level 2 (levelNumber
// 2) exists but has no vocabulary groups at all — deliberately reused below
// to exercise "group doesn't exist yet" without inserting new fixture rows.
const LEVEL_1_NUMBER = 1;
const LEVEL_1_GROUP_1 = 1;
const LEVEL_2_NUMBER = 2;
const NONEXISTENT_LEVEL_NUMBER = 999;

function vocabFields(overrides: Partial<ParsedVocabularyFields> & Pick<ParsedVocabularyFields, "term" | "primaryMeaning">): ParsedVocabularyFields {
  return {
    itemType: "vocabulary",
    levelNumber: LEVEL_1_NUMBER,
    groupNumber: LEVEL_1_GROUP_1,
    partOfSpeech: "noun",
    article: null,
    definition: null,
    pronunciation: null,
    ipa: null,
    context: null,
    creatorNotes: null,
    acceptedAnswers: [],
    ...overrides,
  };
}

function grammarFields(overrides: Partial<ParsedGrammarFields> & Pick<ParsedGrammarFields, "structure" | "primaryMeaning">): ParsedGrammarFields {
  return {
    itemType: "grammar",
    levelNumber: LEVEL_1_NUMBER,
    title: null,
    explanation: "",
    category: null,
    creatorNotes: null,
    requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
    acceptedAnswers: [],
    ...overrides,
  };
}

function validRow(rowNumber: number, term: string, primaryMeaning: string): ValidatedImportRow {
  return { rowNumber, raw: { word: term, translation: primaryMeaning, level: String(LEVEL_1_NUMBER), group: String(LEVEL_1_GROUP_1) }, fields: vocabFields({ term, primaryMeaning }), fieldIssues: [] };
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
      const invalidRow: ValidatedImportRow = { rowNumber: 2, raw: { word: "", translation: "", level: "", group: "" }, fields: null, fieldIssues: [{ field: "word", message: "Missing word." }] };
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [invalidRow] });

      expect(preview[0]).toEqual({ rowNumber: 2, raw: invalidRow.raw, fields: null, fieldIssues: invalidRow.fieldIssues, existingDuplicates: [], duplicateOfEarlierRow: null });
    });
  });

  it("blocks a row whose level number doesn't exist yet, with a clear error", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: { word: "perro", translation: "dog", level: String(NONEXISTENT_LEVEL_NUMBER), group: "1" },
        fields: vocabFields({ term: "perro", primaryMeaning: "dog", levelNumber: NONEXISTENT_LEVEL_NUMBER }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [row] });

      expect(preview[0]!.fields).toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([{ field: "level", message: `Level ${NONEXISTENT_LEVEL_NUMBER} doesn't exist yet.` }]);
    });
  });

  it("blocks a vocabulary row whose group number doesn't exist yet in an otherwise-real level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: { word: "perro", translation: "dog", level: String(LEVEL_2_NUMBER), group: "1" },
        fields: vocabFields({ term: "perro", primaryMeaning: "dog", levelNumber: LEVEL_2_NUMBER, groupNumber: 1 }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [row] });

      expect(preview[0]!.fields).toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([{ field: "group", message: `Level ${LEVEL_2_NUMBER} has no group 1 yet.` }]);
    });
  });

  it("never checks for a group at all on a grammar row — group doesn't apply to grammar", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: { word: "ser vs estar", translation: "to be", level: String(LEVEL_1_NUMBER), group: String(GRAMMAR_GROUP_NUMBER) },
        fields: grammarFields({ structure: "ser vs estar", primaryMeaning: "to be" }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, { languageId, validatedRows: [row] });

      expect(preview[0]!.fields).not.toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([]);
    });
  });
});

describe("bulkImportVocabulary", () => {
  it("creates a pending item per imported row, skips skipped rows, sharing one correlationId across the audit trail", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();
      const rows: ImportRowDecision[] = [
        { fields: vocabFields({ term: "perro", primaryMeaning: "dog" }), decision: "import" },
        { fields: vocabFields({ term: "gato_duplicate_skip_me", primaryMeaning: "should not be created" }), decision: "skip" },
        { fields: vocabFields({ term: "pajaro", primaryMeaning: "bird" }), decision: "import" },
      ];

      const result = await bulkImportVocabulary(tx, { languageId, actorUserId: DEVELOPER_ID, idempotencyKey, rows });

      expect(result.createdVocabularyItemIds).toHaveLength(2);
      expect(result.createdGrammarItemIds).toHaveLength(0);
      for (const id of result.createdVocabularyItemIds) {
        const item = await lockLearningItemForEdit(tx, id);
        expect(item?.status).toBe("pending");
      }

      const audit = await getAuditEvents(tx, { action: "CURRICULUM_ITEM_CREATED", limit: 10 });
      const forThisBatch = audit.items.filter((e) => e.correlationId === idempotencyKey);
      expect(forThisBatch).toHaveLength(2);
    });
  });

  it("creates a grammar item from a group-5 row, distinct from the vocabulary items created alongside it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const rows: ImportRowDecision[] = [
        { fields: vocabFields({ term: "perro", primaryMeaning: "dog" }), decision: "import" },
        { fields: grammarFields({ structure: "ser vs estar", primaryMeaning: "to be" }), decision: "import" },
      ];

      const result = await bulkImportVocabulary(tx, { languageId, actorUserId: DEVELOPER_ID, idempotencyKey: crypto.randomUUID(), rows });

      expect(result.createdVocabularyItemIds).toHaveLength(1);
      expect(result.createdGrammarItemIds).toHaveLength(1);
      const grammarItem = await lockLearningItemForEdit(tx, result.createdGrammarItemIds[0]!);
      expect(grammarItem?.type).toBe("grammar");
      expect(grammarItem?.status).toBe("pending");
    });
  });

  it("creates an imported row over a real duplicate anyway, recording DUPLICATE_APPROVED — the decision to import *is* the homonym approval", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
        rows: [{ fields: vocabFields({ term: "gato", primaryMeaning: "cat (deliberate homonym)" }), decision: "import" }],
      });

      expect(result.createdVocabularyItemIds).toHaveLength(1);
      const audit = await getAuditEvents(tx, { action: "DUPLICATE_APPROVED", limit: 10 });
      expect(audit.items.some((e) => e.correlationId === idempotencyKey && e.resourceId === result.createdVocabularyItemIds[0])).toBe(true);
    });
  });

  it("refuses to run when every row was skipped", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await expect(
        bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [{ fields: vocabFields({ term: "perro", primaryMeaning: "dog" }), decision: "skip" }],
        }),
      ).rejects.toThrow();
    });
  });

  it("rejects a row whose level no longer exists, even though it passed an earlier preview", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await expect(
        bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [{ fields: vocabFields({ term: "perro", primaryMeaning: "dog", levelNumber: NONEXISTENT_LEVEL_NUMBER }), decision: "import" }],
        }),
      ).rejects.toThrow();
    });
  });

  it("rejects a vocabulary row whose group no longer exists in an otherwise-real level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await expect(
        bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [{ fields: vocabFields({ term: "perro", primaryMeaning: "dog", levelNumber: LEVEL_2_NUMBER, groupNumber: 1 }), decision: "import" }],
        }),
      ).rejects.toThrow();
    });
  });

  it("assigns increasing positions within the target level, appended after whatever already exists there", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          { fields: vocabFields({ term: "perro", primaryMeaning: "dog" }), decision: "import" },
          { fields: vocabFields({ term: "pajaro", primaryMeaning: "bird" }), decision: "import" },
        ],
      });

      const [first, second] = await Promise.all(result.createdVocabularyItemIds.map((id) => lockLearningItemForEdit(tx, id)));
      expect(second!.position).toBe(first!.position + 1);
    });
  });
});
