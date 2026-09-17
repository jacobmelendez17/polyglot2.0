import { describe, expect, it } from "vitest";

import {
  DEVELOPER_ID,
  FIXTURE_LEVEL_NUMBER,
  FIXTURE_NEXT_LEVEL_NUMBER,
  ITEM_GATO_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  archiveLearningItem,
  createVocabularyGroup as repoCreateVocabularyGroup,
  getDraft,
  getVocabularyDictionaryFields,
  lockLearningItemForEdit,
  setDictionaryFieldOverrides,
  updateVocabularyFieldsFromImport,
} from "@/domains/curriculum/curriculum-mutation-repository";
import { GRAMMAR_GROUP_NUMBER } from "@/domains/curriculum/vocabulary-import-parsing";
import type {
  ParsedGrammarFields,
  ParsedVocabularyFields,
  ValidatedImportRow,
} from "@/domains/curriculum/vocabulary-import-parsing";

import { getAuditEvents } from "./audit-repository";
import {
  bulkImportVocabulary,
  previewVocabularyImport,
} from "./bulk-import-service";
import type { ImportRowDecision } from "./bulk-import-service";

// The fixture's own levels, not the application's (2026-09-09): fixtures
// live at levels 90/91 so the integration suite can never write demo words
// into the real Level 1. The first has exactly one vocabulary group at
// position 1 (`vocabGroupId`); the second has no groups at all, which is
// deliberately reused below to exercise "group doesn't exist yet" without
// inserting new fixture rows.
const LEVEL_1_NUMBER = FIXTURE_LEVEL_NUMBER;
const LEVEL_1_GROUP_1 = 1;
const LEVEL_2_NUMBER = FIXTURE_NEXT_LEVEL_NUMBER;
const NONEXISTENT_LEVEL_NUMBER = 999;

function vocabFields(
  overrides: Partial<ParsedVocabularyFields> &
    Pick<ParsedVocabularyFields, "term" | "primaryMeaning">,
): ParsedVocabularyFields {
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

function grammarFields(
  overrides: Partial<ParsedGrammarFields> &
    Pick<ParsedGrammarFields, "structure" | "primaryMeaning">,
): ParsedGrammarFields {
  return {
    itemType: "grammar",
    levelNumber: LEVEL_1_NUMBER,
    title: null,
    explanation: "",
    category: null,
    creatorNotes: null,
    requiredQuestions: [
      { format: "translation", direction: "targetToEnglish" },
    ],
    acceptedAnswers: [],
    ...overrides,
  };
}

function validRow(
  rowNumber: number,
  term: string,
  primaryMeaning: string,
): ValidatedImportRow {
  return {
    rowNumber,
    raw: {
      word: term,
      translation: primaryMeaning,
      level: String(LEVEL_1_NUMBER),
      group: String(LEVEL_1_GROUP_1),
    },
    fields: vocabFields({ term, primaryMeaning }),
    fieldIssues: [],
  };
}

describe("previewVocabularyImport", () => {
  it("flags no issues for unique, well-formed rows", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          validRow(2, "perro", "dog"),
          validRow(3, "pajaro", "bird"),
        ],
      });

      expect(
        preview.every(
          (row) =>
            row.existingDuplicates.length === 0 &&
            row.duplicateOfEarlierRow === null,
        ),
      ).toBe(true);
    });
  });

  it("treats a row matching an existing item as an update of it, not a duplicate of it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [validRow(2, "gato", "cat (again)")],
      });

      // Before spec 17 this row was a duplicate an admin had to approve as a
      // homonym; re-importing a corrected file is now ordinary, so the row
      // resolves to the item it names and reports what it would change.
      expect(preview[0]!.action).toBe("update");
      expect(preview[0]!.matchedItemId).toBe(ITEM_GATO_ID);
      expect(preview[0]!.changes).toEqual([
        { field: "primaryMeaning", from: "cat", to: "cat (again)" },
      ]);
      expect(preview[0]!.existingDuplicates).toHaveLength(0);
    });
  });

  it("flags the second of two same-term rows in the same file, referencing the first row's number", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          validRow(2, "perro", "dog"),
          validRow(5, "PERRO", "dog again"),
        ],
      });

      expect(preview[0]!.duplicateOfEarlierRow).toBeNull();
      expect(preview[1]!.duplicateOfEarlierRow).toBe(2);
    });
  });

  it("passes field issues through unchanged for a row with no usable fields, without checking duplicates for it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const invalidRow: ValidatedImportRow = {
        rowNumber: 2,
        raw: { word: "", translation: "", level: "", group: "" },
        fields: null,
        fieldIssues: [{ field: "word", message: "Missing word." }],
      };
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [invalidRow],
      });

      expect(preview[0]).toMatchObject({
        rowNumber: 2,
        raw: invalidRow.raw,
        fields: null,
        fieldIssues: invalidRow.fieldIssues,
        action: "blocked",
        existingDuplicates: [],
        duplicateOfEarlierRow: null,
      });
    });
  });

  it("blocks a row whose level number doesn't exist yet, with a clear error", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: {
          word: "perro",
          translation: "dog",
          level: String(NONEXISTENT_LEVEL_NUMBER),
          group: "1",
        },
        fields: vocabFields({
          term: "perro",
          primaryMeaning: "dog",
          levelNumber: NONEXISTENT_LEVEL_NUMBER,
        }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [row],
      });

      expect(preview[0]!.fields).toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([
        {
          field: "level",
          message: `Level ${NONEXISTENT_LEVEL_NUMBER} doesn't exist yet.`,
        },
      ]);
    });
  });

  it("blocks a vocabulary row whose group number doesn't exist yet in an otherwise-real level", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: {
          word: "perro",
          translation: "dog",
          level: String(LEVEL_2_NUMBER),
          group: "1",
        },
        fields: vocabFields({
          term: "perro",
          primaryMeaning: "dog",
          levelNumber: LEVEL_2_NUMBER,
          groupNumber: 1,
        }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [row],
      });

      expect(preview[0]!.fields).toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([
        {
          field: "group",
          message: `Level ${LEVEL_2_NUMBER} has no group 1 yet.`,
        },
      ]);
    });
  });

  it("never checks for a group at all on a grammar row — group doesn't apply to grammar", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: {
          word: "ser vs estar",
          translation: "to be",
          level: String(LEVEL_1_NUMBER),
          group: String(GRAMMAR_GROUP_NUMBER),
        },
        fields: grammarFields({
          structure: "ser vs estar",
          primaryMeaning: "to be",
        }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [row],
      });

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
        {
          fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
          decision: "import",
        },
        {
          fields: vocabFields({
            term: "gato_duplicate_skip_me",
            primaryMeaning: "should not be created",
          }),
          decision: "skip",
        },
        {
          fields: vocabFields({ term: "pajaro", primaryMeaning: "bird" }),
          decision: "import",
        },
      ];

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
        rows,
      });

      expect(result.createdVocabularyItemIds).toHaveLength(2);
      expect(result.createdGrammarItemIds).toHaveLength(0);
      for (const id of result.createdVocabularyItemIds) {
        const item = await lockLearningItemForEdit(tx, id);
        expect(item?.status).toBe("pending");
      }

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_CREATED",
        limit: 10,
      });
      const forThisBatch = audit.items.filter(
        (e) => e.correlationId === idempotencyKey,
      );
      expect(forThisBatch).toHaveLength(2);
    });
  });

  it("creates a grammar item from a group-5 row, distinct from the vocabulary items created alongside it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const rows: ImportRowDecision[] = [
        {
          fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
          decision: "import",
        },
        {
          fields: grammarFields({
            structure: "ser vs estar",
            primaryMeaning: "to be",
          }),
          decision: "import",
        },
      ];

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows,
      });

      expect(result.createdVocabularyItemIds).toHaveLength(1);
      expect(result.createdGrammarItemIds).toHaveLength(1);
      const grammarItem = await lockLearningItemForEdit(
        tx,
        result.createdGrammarItemIds[0]!,
      );
      expect(grammarItem?.type).toBe("grammar");
      expect(grammarItem?.status).toBe("pending");
    });
  });

  it("updates the word it matches instead of creating a second one — a file cannot author a homonym (spec 17)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
        rows: [
          {
            fields: vocabFields({
              term: "gato",
              primaryMeaning: "cat (deliberate homonym)",
            }),
            decision: "import",
          },
        ],
      });

      // Until spec 17 this created a second `gato` and recorded
      // DUPLICATE_APPROVED. Re-importing a corrected file is now the common
      // case, and duplicate detection normalizes the same display form the
      // same way this matcher does — so an identical term can only mean the
      // same word. A genuine homonym is created in Admin, where the two can
      // be told apart.
      expect(result.createdVocabularyItemIds).toHaveLength(0);
      expect(result.draftedItemIds).toEqual([ITEM_GATO_ID]);
      const audit = await getAuditEvents(tx, {
        action: "DUPLICATE_APPROVED",
        limit: 10,
      });
      expect(audit.items.some((e) => e.correlationId === idempotencyKey)).toBe(
        false,
      );
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
          rows: [
            {
              fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
              decision: "skip",
            },
          ],
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
          rows: [
            {
              fields: vocabFields({
                term: "perro",
                primaryMeaning: "dog",
                levelNumber: NONEXISTENT_LEVEL_NUMBER,
              }),
              decision: "import",
            },
          ],
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
          rows: [
            {
              fields: vocabFields({
                term: "perro",
                primaryMeaning: "dog",
                levelNumber: LEVEL_2_NUMBER,
                groupNumber: 1,
              }),
              decision: "import",
            },
          ],
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
          {
            fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
            decision: "import",
          },
          {
            fields: vocabFields({ term: "pajaro", primaryMeaning: "bird" }),
            decision: "import",
          },
        ],
      });

      const [first, second] = await Promise.all(
        result.createdVocabularyItemIds.map((id) =>
          lockLearningItemForEdit(tx, id),
        ),
      );
      expect(second!.position).toBe(first!.position + 1);
    });
  });
});

describe("re-importing words that already exist (spec 17)", () => {
  function importRow(
    fields: ParsedVocabularyFields | ParsedGrammarFields,
  ): ImportRowDecision {
    return { fields, decision: "import" };
  }

  it("updates a pending item in place, keeping its permanent ID", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      // Imported once, then re-imported with a corrected translation — the
      // exact shape of fixing a typo in a file and running it again.
      const first = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(
            vocabFields({ term: "murcielago", primaryMeaning: "bat (typo)" }),
          ),
        ],
      });
      const createdId = first.createdVocabularyItemIds[0]!;

      const second = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(vocabFields({ term: "murcielago", primaryMeaning: "bat" })),
        ],
      });

      // The same row a learner's progress, SRS state, and decks point at.
      expect(second.updatedVocabularyItemIds).toEqual([createdId]);
      expect(second.createdVocabularyItemIds).toEqual([]);
      expect(
        (await getVocabularyDictionaryFields(tx, createdId))?.primaryMeaning,
      ).toBe("bat");
    });
  });

  it("collapses a term repeated inside one file into a create and an update, never two items", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(vocabFields({ term: "lechuza", primaryMeaning: "owl" })),
          importRow(
            vocabFields({ term: "lechuza", primaryMeaning: "barn owl" }),
          ),
        ],
      });

      expect(result.createdVocabularyItemIds).toHaveLength(1);
      expect(result.updatedVocabularyItemIds).toEqual(
        result.createdVocabularyItemIds,
      );
      expect(
        (
          await getVocabularyDictionaryFields(
            tx,
            result.createdVocabularyItemIds[0]!,
          )
        )?.primaryMeaning,
      ).toBe("barn owl");
    });
  });

  it("leaves fields the file does not carry exactly as they were", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const first = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(
            vocabFields({
              term: "murcielago",
              primaryMeaning: "bat",
              article: "el",
              creatorNotes: "authored note",
              partOfSpeech: "noun",
            }),
          ),
        ],
      });
      const createdId = first.createdVocabularyItemIds[0]!;

      // The authored Level 1 file is four columns wide, so every optional
      // field arrives as null. Writing those through would blank the article
      // and creator notes of every word it touched.
      await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(
            vocabFields({
              term: "murcielago",
              primaryMeaning: "bat, the mammal",
              partOfSpeech: "",
            }),
          ),
        ],
      });

      const after = await getVocabularyDictionaryFields(tx, createdId);
      expect(after?.primaryMeaning).toBe("bat, the mammal");
      expect(after?.article).toBe("el");
      expect(after?.partOfSpeech).toBe("noun");
      expect(after?.creatorNotes).toBe("authored note");
    });
  });

  it("never overwrites a field an author has taken over", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await setDictionaryFieldOverrides(tx, ITEM_GATO_ID, ["definition"]);
      await updateVocabularyFieldsFromImport(tx, ITEM_GATO_ID, {
        definition: "authored by hand",
      });

      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          {
            rowNumber: 2,
            raw: {},
            fields: vocabFields({
              term: "gato",
              primaryMeaning: "cat",
              definition: "a dictionary definition",
            }),
            fieldIssues: [],
          },
        ],
      });
      expect(preview[0]!.changes).toEqual([]);
      expect(preview[0]!.action).toBe("unchanged");
    });
  });

  it("routes a published item's update into its draft rather than editing it live", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(
            vocabFields({ term: "gato", primaryMeaning: "cat, revised" }),
          ),
        ],
      });

      expect(result.draftedItemIds).toEqual([ITEM_GATO_ID]);
      // Live curriculum is untouched until an Admin publishes.
      expect(
        (await getVocabularyDictionaryFields(tx, ITEM_GATO_ID))?.primaryMeaning,
      ).toBe("cat");
      const draft = await getDraft(tx, ITEM_GATO_ID);
      expect(draft?.data).toMatchObject({
        type: "vocabulary",
        fields: { primaryMeaning: "cat, revised", term: "gato" },
      });
    });
  });

  it("reports an archived word instead of silently reviving it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      await archiveLearningItem(tx, ITEM_GATO_ID);

      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [validRow(2, "gato", "cat")],
      });
      expect(preview[0]!.action).toBe("blocked");
      expect(preview[0]!.blockedReason).toMatch(/archived/i);

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [importRow(vocabFields({ term: "gato", primaryMeaning: "cat" }))],
      });
      expect(result.blocked).toHaveLength(1);
      expect(result.createdVocabularyItemIds).toEqual([]);
      expect(result.updatedVocabularyItemIds).toEqual([]);
    });
  });

  it("classifies a row that changes nothing as unchanged, and writes nothing for it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);

      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [validRow(2, "gato", "cat")],
      });
      expect(preview[0]!.action).toBe("unchanged");

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [importRow(vocabFields({ term: "gato", primaryMeaning: "cat" }))],
      });
      expect(result.unchangedCount).toBe(1);
      expect(result.updatedVocabularyItemIds).toEqual([]);
    });
  });

  it("reports a different level or group as a move, and applies it to the same item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level2Id } = await seedTestFixtures(tx);

      const moved = vocabFields({
        term: "gato",
        primaryMeaning: "cat",
        levelNumber: LEVEL_2_NUMBER,
        groupNumber: LEVEL_1_GROUP_1,
      });
      // Level 2 needs a group before a vocabulary row can land in it.
      await repoCreateVocabularyGroup(tx, {
        levelId: level2Id,
        languageId,
        name: "Level 2 group",
      });

      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          { rowNumber: 2, raw: {}, fields: moved, fieldIssues: [] },
        ],
      });
      expect(preview[0]!.action).toBe("move");
      expect(preview[0]!.placement).toMatchObject({
        fromLevelNumber: LEVEL_1_NUMBER,
        toLevelNumber: LEVEL_2_NUMBER,
      });

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [importRow(moved)],
      });
      expect(result.movedItemIds).toEqual([ITEM_GATO_ID]);
      expect((await lockLearningItemForEdit(tx, ITEM_GATO_ID))?.levelId).toBe(
        level2Id,
      );
    });
  });

  it("still creates a word the curriculum does not have", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          importRow(vocabFields({ term: "murcielago", primaryMeaning: "bat" })),
        ],
      });
      expect(result.createdVocabularyItemIds).toHaveLength(1);
      expect(result.updatedVocabularyItemIds).toEqual([]);
    });
  });
});
