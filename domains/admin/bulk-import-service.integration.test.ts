import { describe, expect, it } from "vitest";

import {
  DEVELOPER_ID,
  FIXTURE_LEVEL_NUMBER,
  FIXTURE_NEXT_LEVEL_NUMBER,
  ITEM_GATO_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  dictionaryEntries,
  dictionaryPronunciations,
  dictionarySenses,
  learningItems,
  lexicalSources,
  vocabularyDictionaryMappings,
  vocabularySelectedSenses,
} from "@/db/schema";
import {
  archiveLearningItem,
  createVocabularyGroup as repoCreateVocabularyGroup,
  getAcceptedAnswers,
  getDraft,
  getVocabularyDictionaryFields,
  lockLearningItemForEdit,
  setDictionaryFieldOverrides,
  updateVocabularyFieldsFromImport,
} from "@/domains/curriculum/curriculum-mutation-repository";
import {
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/curriculum-repository";
import { GRAMMAR_GROUP_NUMBER } from "@/domains/curriculum/vocabulary-import-parsing";
import { eq } from "drizzle-orm";
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
    curriculumKey: null,
    levelName: null,
    groupName: null,
    forceNewHomonym: false,
    partOfSpeech: "noun",
    // `undefined`, not `null` — this factory's "not specified" default has
    // to match the real parser's (`vocabulary-import-parsing.ts`), where
    // spec 25 §7.4 reserves `null` specifically for an explicit `__CLEAR__`.
    // A caller that actually wants to test clearing overrides one of these
    // to `null` explicitly.
    article: undefined,
    definition: undefined,
    pronunciation: undefined,
    ipa: undefined,
    context: undefined,
    creatorNotes: undefined,
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
    curriculumKey: null,
    levelName: null,
    forceNewHomonym: false,
    title: null,
    explanation: "",
    category: null,
    // See `vocabFields`'s identical note above.
    creatorNotes: undefined,
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

/** Reads a learning item's real, backfilled/generated curriculum key directly (spec 25 Unit 1) — used to build a row that matches by key instead of spelling. */
async function getCurriculumKey(
  tx: TestTx,
  learningItemId: string,
): Promise<string> {
  const [row] = await tx
    .select({ curriculumKey: learningItems.curriculumKey })
    .from(learningItems)
    .where(eq(learningItems.id, learningItemId));
  return row!.curriculumKey;
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
          message: `Level ${NONEXISTENT_LEVEL_NUMBER} doesn't exist yet. Provide level_name to create it.`,
        },
      ]);
    });
  });

  it("blocks a row whose optional language column doesn't match this import's target language (spec 25 Unit 2)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: {
          word: "perro",
          translation: "dog",
          level: String(LEVEL_1_NUMBER),
          group: String(LEVEL_1_GROUP_1),
          language: "fr-FR",
        },
        fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [row],
      });

      expect(preview[0]!.fields).toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([
        {
          field: "language",
          message: 'This row is for "fr-FR", but this import is for "es-MX".',
        },
      ]);
    });
  });

  it("accepts a row whose language column matches this import's target language, case-insensitively", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const row: ValidatedImportRow = {
        rowNumber: 2,
        raw: {
          word: "perro",
          translation: "dog",
          level: String(LEVEL_1_NUMBER),
          group: String(LEVEL_1_GROUP_1),
          language: "es-mx",
        },
        fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
        fieldIssues: [],
      };
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [row],
      });

      expect(preview[0]!.fieldIssues).toEqual([]);
      expect(preview[0]!.action).toBe("create");
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
          message: `Level ${LEVEL_2_NUMBER} has no group 1 yet. Provide batch_name to create it.`,
        },
      ]);
    });
  });

  describe("spec 25 Unit 3 — automatic Level/group creation", () => {
    it("proposes creating a new Level when level_name is supplied for a nonexistent level", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const row: ValidatedImportRow = {
          rowNumber: 2,
          raw: {
            word: "por vs para",
            translation: "for",
            level: String(NONEXISTENT_LEVEL_NUMBER),
            group: String(GRAMMAR_GROUP_NUMBER),
            level_name: "Everyday Life",
          },
          fields: grammarFields({
            structure: "por vs para",
            primaryMeaning: "for",
            levelNumber: NONEXISTENT_LEVEL_NUMBER,
            levelName: "Everyday Life",
          }),
          fieldIssues: [],
        };
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [row],
        });

        expect(preview[0]!.fieldIssues).toEqual([]);
        expect(preview[0]!.action).toBe("create");
        expect(preview[0]!.levelToCreate).toEqual({
          levelNumber: NONEXISTENT_LEVEL_NUMBER,
          name: "Everyday Life",
        });
      });
    });

    it("proposes creating a new group within an existing Level when batch_name is supplied", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const row: ValidatedImportRow = {
          rowNumber: 2,
          raw: {
            word: "perro",
            translation: "dog",
            level: String(LEVEL_2_NUMBER),
            group: "1",
            batch_name: "Animals",
          },
          fields: vocabFields({
            term: "perro",
            primaryMeaning: "dog",
            levelNumber: LEVEL_2_NUMBER,
            groupNumber: 1,
            groupName: "Animals",
          }),
          fieldIssues: [],
        };
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [row],
        });

        expect(preview[0]!.fieldIssues).toEqual([]);
        expect(preview[0]!.action).toBe("create");
        expect(preview[0]!.levelToCreate).toBeNull();
        expect(preview[0]!.groupToCreate).toEqual({
          groupNumber: 1,
          name: "Animals",
        });
      });
    });

    it("proposes creating both the Level and its group when neither exists yet", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const row: ValidatedImportRow = {
          rowNumber: 2,
          raw: {
            word: "perro",
            translation: "dog",
            level: String(NONEXISTENT_LEVEL_NUMBER),
            group: "2",
            level_name: "Everyday Life",
            batch_name: "Food & Drinks",
          },
          fields: vocabFields({
            term: "perro",
            primaryMeaning: "dog",
            levelNumber: NONEXISTENT_LEVEL_NUMBER,
            groupNumber: 2,
            levelName: "Everyday Life",
            groupName: "Food & Drinks",
          }),
          fieldIssues: [],
        };
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [row],
        });

        expect(preview[0]!.fieldIssues).toEqual([]);
        expect(preview[0]!.levelToCreate).toEqual({
          levelNumber: NONEXISTENT_LEVEL_NUMBER,
          name: "Everyday Life",
        });
        expect(preview[0]!.groupToCreate).toEqual({
          groupNumber: 2,
          name: "Food & Drinks",
        });
      });
    });

    it("blocks a row whose level_name conflicts with the existing Level's name, rather than silently renaming it (spec §9.1)", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const row: ValidatedImportRow = {
          rowNumber: 2,
          raw: {
            word: "perro",
            translation: "dog",
            level: String(LEVEL_1_NUMBER),
            group: "1",
            level_name: "A Completely Different Name",
          },
          fields: vocabFields({
            term: "perro",
            primaryMeaning: "dog",
            levelName: "A Completely Different Name",
          }),
          fieldIssues: [],
        };
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [row],
        });

        expect(preview[0]!.action).toBe("blocked");
        expect(preview[0]!.blockedReason).toContain(
          `Level ${LEVEL_1_NUMBER} is named "Fixture level"`,
        );
        expect(preview[0]!.blockedReason).toContain(
          "A Completely Different Name",
        );
      });
    });

    it("blocks a row whose batch_name conflicts with the existing group's name", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const row: ValidatedImportRow = {
          rowNumber: 2,
          raw: {
            word: "perro",
            translation: "dog",
            level: String(LEVEL_1_NUMBER),
            group: String(LEVEL_1_GROUP_1),
            batch_name: "A Completely Different Name",
          },
          fields: vocabFields({
            term: "perro",
            primaryMeaning: "dog",
            groupName: "A Completely Different Name",
          }),
          fieldIssues: [],
        };
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [row],
        });

        expect(preview[0]!.action).toBe("blocked");
        expect(preview[0]!.blockedReason).toContain('is named "Home & Basics"');
        expect(preview[0]!.blockedReason).toContain(
          "A Completely Different Name",
        );
      });
    });

    it("reuses the existing Level/group silently when level_name/batch_name are omitted, per spec §5.2", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [validRow(2, "perro", "dog")],
        });

        expect(preview[0]!.fieldIssues).toEqual([]);
        expect(preview[0]!.action).toBe("create");
        expect(preview[0]!.levelToCreate).toBeNull();
        expect(preview[0]!.groupToCreate).toBeNull();
      });
    });

    it("does not treat a matching level_name/batch_name as a conflict", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const row: ValidatedImportRow = {
          rowNumber: 2,
          raw: {
            word: "perro",
            translation: "dog",
            level: String(LEVEL_1_NUMBER),
            group: String(LEVEL_1_GROUP_1),
            level_name: "Fixture level",
            batch_name: "Home & Basics",
          },
          fields: vocabFields({
            term: "perro",
            primaryMeaning: "dog",
            levelName: "Fixture level",
            groupName: "Home & Basics",
          }),
          fieldIssues: [],
        };
        const preview = await previewVocabularyImport(tx, {
          languageId,
          validatedRows: [row],
        });

        expect(preview[0]!.action).toBe("create");
        expect(preview[0]!.blockedReason).toBeNull();
      });
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

  it("creates accepted answers from synonyms/variations the parser already turned into meaning/term entries (spec 25 Unit 2)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            fields: vocabFields({
              term: "gato_con_sinonimos",
              primaryMeaning: "cat",
              acceptedAnswers: [
                { side: "meaning", value: "kitty" },
                { side: "term", value: "gatto" },
              ],
            }),
            decision: "import",
          },
        ],
      });

      expect(result.createdVocabularyItemIds).toHaveLength(1);
      const answers = await getAcceptedAnswers(
        tx,
        result.createdVocabularyItemIds[0]!,
      );
      expect(answers).toEqual(
        expect.arrayContaining([
          { side: "meaning", value: "kitty" },
          { side: "term", value: "gatto" },
        ]),
      );
    });
  });

  describe("spec 25 Unit 3 — automatic Level/group creation", () => {
    it("creates a new Level and group, then the item, when neither exists yet", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const result = await bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [
            {
              decision: "import",
              fields: vocabFields({
                term: "nueva_estructura_perro",
                primaryMeaning: "dog",
                levelNumber: NONEXISTENT_LEVEL_NUMBER,
                groupNumber: 2,
                levelName: "Everyday Life",
                groupName: "Food & Drinks",
              }),
            },
          ],
        });

        expect(result.createdVocabularyItemIds).toHaveLength(1);
        const levels = await getLevelsByLanguage(tx, languageId);
        const newLevel = levels.find(
          (l) => l.levelNumber === NONEXISTENT_LEVEL_NUMBER,
        );
        expect(newLevel?.name).toBe("Everyday Life");
        expect(newLevel?.status).toBe("draft");

        const groups = await getVocabularyGroupsByLanguage(tx, languageId);
        const newGroup = groups.find(
          (g) => g.levelId === newLevel!.id && g.position === 2,
        );
        expect(newGroup?.name).toBe("Food & Drinks");
        expect(newGroup?.status).toBe("draft");

        const item = await lockLearningItemForEdit(
          tx,
          result.createdVocabularyItemIds[0]!,
        );
        expect(item?.levelId).toBe(newLevel!.id);
      });
    });

    it("creates a Level/group only once even when two rows in the same import both need it", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const result = await bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [
            {
              decision: "import",
              fields: vocabFields({
                term: "primero_shared_level",
                primaryMeaning: "first",
                levelNumber: NONEXISTENT_LEVEL_NUMBER,
                groupNumber: 3,
                levelName: "Everyday Life",
                groupName: "Shared Batch",
              }),
            },
            {
              decision: "import",
              fields: vocabFields({
                term: "segundo_shared_level",
                primaryMeaning: "second",
                levelNumber: NONEXISTENT_LEVEL_NUMBER,
                groupNumber: 3,
                // level_name/batch_name omitted — this row relies on the
                // first row (processed just before it) having already
                // created the structure within this same commit.
              }),
            },
          ],
        });

        expect(result.createdVocabularyItemIds).toHaveLength(2);
        const levels = await getLevelsByLanguage(tx, languageId);
        const matchingLevels = levels.filter(
          (l) => l.levelNumber === NONEXISTENT_LEVEL_NUMBER,
        );
        expect(matchingLevels).toHaveLength(1);

        const groups = await getVocabularyGroupsByLanguage(tx, languageId);
        const matchingGroups = groups.filter(
          (g) => g.levelId === matchingLevels[0]!.id && g.position === 3,
        );
        expect(matchingGroups).toHaveLength(1);

        const [firstItem, secondItem] = await Promise.all(
          result.createdVocabularyItemIds.map((id) =>
            lockLearningItemForEdit(tx, id),
          ),
        );
        expect(firstItem?.levelId).toBe(matchingLevels[0]!.id);
        expect(secondItem?.levelId).toBe(matchingLevels[0]!.id);
      });
    });

    it("records LEVEL_CREATED/GROUP_CREATED audit events sharing the import's correlationId", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const idempotencyKey = crypto.randomUUID();
        await bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey,
          rows: [
            {
              decision: "import",
              fields: vocabFields({
                term: "audited_new_structure",
                primaryMeaning: "dog",
                levelNumber: NONEXISTENT_LEVEL_NUMBER,
                groupNumber: 4,
                levelName: "Everyday Life",
                groupName: "Audited Batch",
              }),
            },
          ],
        });

        const levelEvents = await getAuditEvents(tx, {
          action: "LEVEL_CREATED",
          limit: 10,
        });
        const groupEvents = await getAuditEvents(tx, {
          action: "GROUP_CREATED",
          limit: 10,
        });
        expect(
          levelEvents.items.some((e) => e.correlationId === idempotencyKey),
        ).toBe(true);
        expect(
          groupEvents.items.some((e) => e.correlationId === idempotencyKey),
        ).toBe(true);
      });
    });

    it("blocks the row and creates nothing when level_name conflicts with the existing Level's name", async () => {
      await withTestTransaction(async (tx) => {
        const { languageId } = await seedTestFixtures(tx);
        const result = await bulkImportVocabulary(tx, {
          languageId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          rows: [
            {
              decision: "import",
              fields: vocabFields({
                term: "conflicting_level_name_row",
                primaryMeaning: "dog",
                levelName: "A Completely Different Name",
              }),
            },
          ],
        });

        expect(result.createdVocabularyItemIds).toHaveLength(0);
        expect(result.blocked).toHaveLength(1);
        expect(result.blocked[0]!.reason).toContain(
          `Level ${LEVEL_1_NUMBER} is named "Fixture level"`,
        );
      });
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

  it("spec 25 §10.1 — creates a deliberate second item when forceNewHomonym overrides the term match, auditing DUPLICATE_APPROVED", async () => {
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
              primaryMeaning: "cat (a deliberate second sense)",
              forceNewHomonym: true,
            }),
            decision: "import",
          },
        ],
      });

      expect(result.createdVocabularyItemIds).toHaveLength(1);
      const newItemId = result.createdVocabularyItemIds[0]!;
      expect(newItemId).not.toBe(ITEM_GATO_ID);

      const audit = await getAuditEvents(tx, {
        action: "DUPLICATE_APPROVED",
        resourceId: newItemId,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
      expect(audit.items[0]?.correlationId).toBe(idempotencyKey);
      expect(audit.items[0]?.afterData).toEqual({
        approvedAsHomonymOf: [ITEM_GATO_ID],
      });
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

describe("spec 25 Unit 6 — metadata enrichment and spellcheck", () => {
  it("proposes filling a missing definition/ipa from a confirmed dictionary match, tagged with dictionary provenance, and actually writes it on commit", async () => {
    await withTestTransaction(async (tx: TestTx) => {
      const { languageId } = await seedTestFixtures(tx);

      const [source] = await tx
        .insert(lexicalSources)
        .values({
          code: "test-source",
          provider: "test-provider",
          sourceType: "dictionary",
          sourceLanguage: "es",
          entryLanguage: "en",
          licenseMetadata: {},
          attributionText: "From Test, CC BY-SA 4.0",
        })
        .returning();
      const [entry] = await tx
        .insert(dictionaryEntries)
        .values({
          languageId,
          sourceId: source!.id,
          lemma: "gato",
          normalizedLemma: "gato",
          partOfSpeech: "noun",
          sourceEntryKey: "gato#noun#1",
        })
        .returning();
      const [sense] = await tx
        .insert(dictionarySenses)
        .values({
          dictionaryEntryId: entry!.id,
          sourceSenseKey: "s1",
          sourceFingerprint: "f1",
          senseOrder: 0,
          gloss: "a small domesticated feline",
        })
        .returning();
      const [pronunciation] = await tx
        .insert(dictionaryPronunciations)
        .values({
          dictionaryEntryId: entry!.id,
          ipa: "/ˈɡato/",
          regionCode: "es-MX",
          sourceFingerprint: "p1",
        })
        .returning();
      await tx.insert(vocabularyDictionaryMappings).values({
        vocabularyItemId: ITEM_GATO_ID,
        dictionaryEntryId: entry!.id,
        lookupForm: "gato",
        matchStatus: "manual",
        confidence: "high",
        preferredPronunciationId: pronunciation!.id,
      });
      await tx.insert(vocabularySelectedSenses).values({
        vocabularyItemId: ITEM_GATO_ID,
        dictionarySenseId: sense!.id,
        position: 0,
      });

      // The row itself says nothing about definition/ipa/pronunciation — an
      // ordinary re-import that would otherwise classify as "unchanged".
      const validatedRows: ValidatedImportRow[] = [
        {
          rowNumber: 2,
          raw: {},
          fieldIssues: [],
          fields: vocabFields({ term: "gato", primaryMeaning: "cat" }),
        },
      ];
      const [preview] = await previewVocabularyImport(tx, {
        languageId,
        validatedRows,
      });

      expect(preview?.action).toBe("update");
      expect(preview?.changes).toEqual(
        expect.arrayContaining([
          {
            field: "definition",
            from: null,
            to: "a small domesticated feline",
            source: "dictionary",
          },
          { field: "ipa", from: null, to: "/ˈɡato/", source: "dictionary" },
        ]),
      );

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [{ fields: preview!.fields!, decision: "import" }],
      });

      // gato is `published` in the fixtures — an enrichment fill is content
      // like any other, so it lands in the draft, never live (spec 25 §14.2).
      expect(result.draftedItemIds).toEqual([ITEM_GATO_ID]);
      const draft = await getDraft(tx, ITEM_GATO_ID);
      expect(draft?.data).toMatchObject({
        type: "vocabulary",
        fields: {
          definition: "a small domesticated feline",
          ipa: "/ˈɡato/",
        },
      });
    });
  });

  it("never proposes enrichment for a field the CSV row already supplied, or one the admin already overrode", async () => {
    await withTestTransaction(async (tx: TestTx) => {
      const { languageId } = await seedTestFixtures(tx);

      const [source] = await tx
        .insert(lexicalSources)
        .values({
          code: "test-source-2",
          provider: "test-provider",
          sourceType: "dictionary",
          sourceLanguage: "es",
          entryLanguage: "en",
          licenseMetadata: {},
          attributionText: "From Test, CC BY-SA 4.0",
        })
        .returning();
      const [entry] = await tx
        .insert(dictionaryEntries)
        .values({
          languageId,
          sourceId: source!.id,
          lemma: "gato",
          normalizedLemma: "gato",
          partOfSpeech: "noun",
          sourceEntryKey: "gato#noun#2",
        })
        .returning();
      const [sense] = await tx
        .insert(dictionarySenses)
        .values({
          dictionaryEntryId: entry!.id,
          sourceSenseKey: "s1",
          sourceFingerprint: "f1",
          senseOrder: 0,
          gloss: "dictionary gloss",
        })
        .returning();
      await tx.insert(vocabularyDictionaryMappings).values({
        vocabularyItemId: ITEM_GATO_ID,
        dictionaryEntryId: entry!.id,
        lookupForm: "gato",
        matchStatus: "manual",
        confidence: "high",
      });
      await tx.insert(vocabularySelectedSenses).values({
        vocabularyItemId: ITEM_GATO_ID,
        dictionarySenseId: sense!.id,
        position: 0,
      });

      // definition already overridden by an author — must never be replaced.
      await setDictionaryFieldOverrides(tx, ITEM_GATO_ID, ["definition"]);

      const validatedRows: ValidatedImportRow[] = [
        {
          rowNumber: 2,
          raw: {},
          fieldIssues: [],
          // The CSV supplies its own ipa — that always wins over enrichment.
          fields: vocabFields({
            term: "gato",
            primaryMeaning: "cat",
            ipa: "/csv-authored/",
          }),
        },
      ];
      const [preview] = await previewVocabularyImport(tx, {
        languageId,
        validatedRows,
      });

      expect(preview?.changes).toEqual([
        { field: "ipa", from: null, to: "/csv-authored/" },
      ]);
    });
  });

  it("suggests the nearest known dictionary lemma for a new item's likely-misspelled term", async () => {
    await withTestTransaction(async (tx: TestTx) => {
      const { languageId } = await seedTestFixtures(tx);
      const [source] = await tx
        .insert(lexicalSources)
        .values({
          code: "test-source-3",
          provider: "test-provider",
          sourceType: "dictionary",
          sourceLanguage: "es",
          entryLanguage: "en",
          licenseMetadata: {},
          attributionText: "From Test, CC BY-SA 4.0",
        })
        .returning();
      await tx.insert(dictionaryEntries).values({
        languageId,
        sourceId: source!.id,
        lemma: "biblioteca",
        normalizedLemma: "biblioteca",
        partOfSpeech: "noun",
        sourceEntryKey: "biblioteca#noun#1",
      });

      const validatedRows: ValidatedImportRow[] = [
        {
          rowNumber: 2,
          raw: {},
          fieldIssues: [],
          fields: vocabFields({ term: "bibloteca", primaryMeaning: "library" }),
        },
      ];
      const [preview] = await previewVocabularyImport(tx, {
        languageId,
        validatedRows,
      });

      expect(preview?.action).toBe("create");
      expect(preview?.spellingWarning).toEqual({
        field: "term",
        original: "bibloteca",
        suggested: "biblioteca",
      });
    });
  });

  it("never warns when the term is already a known word", async () => {
    await withTestTransaction(async (tx: TestTx) => {
      const { languageId } = await seedTestFixtures(tx);
      const [source] = await tx
        .insert(lexicalSources)
        .values({
          code: "test-source-4",
          provider: "test-provider",
          sourceType: "dictionary",
          sourceLanguage: "es",
          entryLanguage: "en",
          licenseMetadata: {},
          attributionText: "From Test, CC BY-SA 4.0",
        })
        .returning();
      await tx.insert(dictionaryEntries).values({
        languageId,
        sourceId: source!.id,
        lemma: "perro",
        normalizedLemma: "perro",
        partOfSpeech: "noun",
        sourceEntryKey: "perro#noun#1",
      });

      const validatedRows: ValidatedImportRow[] = [
        {
          rowNumber: 2,
          raw: {},
          fieldIssues: [],
          fields: vocabFields({ term: "perro", primaryMeaning: "dog" }),
        },
      ];
      const [preview] = await previewVocabularyImport(tx, {
        languageId,
        validatedRows,
      });
      expect(preview?.spellingWarning).toBeNull();
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

  it("reports a different level or group as a move, refuses to apply it unapproved (spec 25 §10.3), then applies it once approved", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, level2Id } = await seedTestFixtures(tx);

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

      // A move is never applied silently — a plain "import" decision with
      // no explicit approval is treated exactly like a blocked row.
      const unapproved = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [importRow(moved)],
      });
      expect(unapproved.movedItemIds).toEqual([]);
      expect(unapproved.blocked).toEqual([
        {
          displayForm: "gato",
          reason:
            "Structural move requires approval. Approve the move and re-import.",
        },
      ]);
      // The unapproved move never happened — the item is still in Level 1.
      expect((await lockLearningItemForEdit(tx, ITEM_GATO_ID))?.levelId).toBe(
        level1Id,
      );

      const approved = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [{ fields: moved, decision: "import", approvedMove: true }],
      });
      expect(approved.movedItemIds).toEqual([ITEM_GATO_ID]);
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

describe("spec 25 Unit 4 — key-based matching and explicit clearing", () => {
  it("matches an existing pending item by curriculum_key and renames it, even though the spelling changed entirely", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const created = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            fields: vocabFields({
              term: "palabra_original",
              primaryMeaning: "original word",
            }),
            decision: "import",
          },
        ],
      });
      const learningItemId = created.createdVocabularyItemIds[0]!;
      const curriculumKey = await getCurriculumKey(tx, learningItemId);

      const renamed = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            fields: vocabFields({
              // A totally different spelling — under term-based matching
              // this would look like a brand-new word.
              term: "palabra_completamente_diferente",
              primaryMeaning: "original word",
              curriculumKey,
            }),
            decision: "import",
          },
        ],
      });

      expect(renamed.createdVocabularyItemIds).toEqual([]);
      expect(renamed.updatedVocabularyItemIds).toEqual([learningItemId]);
      expect(
        (await getVocabularyDictionaryFields(tx, learningItemId))?.term,
      ).toBe("palabra_completamente_diferente");
      // The permanent id, and therefore the key itself, never changed.
      expect(await getCurriculumKey(tx, learningItemId)).toBe(curriculumKey);
    });
  });

  it("blocks a row whose curriculum_key matches nothing, rather than treating it as a new item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          {
            rowNumber: 2,
            raw: {
              word: "perro",
              translation: "dog",
              level: String(LEVEL_1_NUMBER),
              group: String(LEVEL_1_GROUP_1),
              curriculum_key: "es-MX:vocab:doesnotexist",
            },
            fields: vocabFields({
              term: "perro",
              primaryMeaning: "dog",
              curriculumKey: "es-MX:vocab:doesnotexist",
            }),
            fieldIssues: [],
          },
        ],
      });

      expect(preview[0]!.fields).toBeNull();
      expect(preview[0]!.fieldIssues).toEqual([
        {
          field: "curriculum_key",
          message: 'No curriculum item has the key "es-MX:vocab:doesnotexist".',
        },
      ]);
    });
  });

  it("blocks a key match against an archived item instead of silently reviving it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const curriculumKey = await getCurriculumKey(tx, ITEM_GATO_ID);
      await archiveLearningItem(tx, ITEM_GATO_ID);

      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          {
            rowNumber: 2,
            raw: {},
            fields: vocabFields({
              term: "gato",
              primaryMeaning: "cat",
              curriculumKey,
            }),
            fieldIssues: [],
          },
        ],
      });

      expect(preview[0]!.action).toBe("blocked");
      expect(preview[0]!.blockedReason).toBe(
        "This item is archived. Restore it in Admin before re-importing it.",
      );
    });
  });

  it("clears an existing field on a pending item via __CLEAR__, applied directly (no draft)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const created = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            fields: vocabFields({
              term: "palabra_con_nota",
              primaryMeaning: "word with a note",
              creatorNotes: "a note to clear later",
            }),
            decision: "import",
          },
        ],
      });
      const learningItemId = created.createdVocabularyItemIds[0]!;
      const curriculumKey = await getCurriculumKey(tx, learningItemId);
      expect(
        (await getVocabularyDictionaryFields(tx, learningItemId))?.creatorNotes,
      ).toBe("a note to clear later");

      const cleared = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            fields: vocabFields({
              term: "palabra_con_nota",
              primaryMeaning: "word with a note",
              curriculumKey,
              creatorNotes: null,
            }),
            decision: "import",
          },
        ],
      });

      expect(cleared.updatedVocabularyItemIds).toEqual([learningItemId]);
      expect(
        (await getVocabularyDictionaryFields(tx, learningItemId))?.creatorNotes,
      ).toBeNull();
    });
  });

  it("clears an existing field on a published item via __CLEAR__, landing in its draft", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const curriculumKey = await getCurriculumKey(tx, ITEM_GATO_ID);

      const result = await bulkImportVocabulary(tx, {
        languageId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        rows: [
          {
            fields: vocabFields({
              term: "gato",
              primaryMeaning: "cat",
              curriculumKey,
              article: null,
            }),
            decision: "import",
          },
        ],
      });

      expect(result.draftedItemIds).toEqual([ITEM_GATO_ID]);
      const draft = await getDraft(tx, ITEM_GATO_ID);
      expect(draft?.data.type).toBe("vocabulary");
      expect(
        draft?.data.type === "vocabulary" ? draft.data.fields.article : "n/a",
      ).toBeNull();
      // The live, published row is untouched until an Admin publishes the draft.
      expect(
        (await getVocabularyDictionaryFields(tx, ITEM_GATO_ID))?.article,
      ).toBe("el");
    });
  });

  it("does not propose clearing a field that is already empty", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedTestFixtures(tx);
      const curriculumKey = await getCurriculumKey(tx, ITEM_GATO_ID);

      const preview = await previewVocabularyImport(tx, {
        languageId,
        validatedRows: [
          {
            rowNumber: 2,
            raw: {},
            fields: vocabFields({
              term: "gato",
              primaryMeaning: "cat",
              curriculumKey,
              article: "el",
              // gato's fixture `definition` is already null/unset.
              definition: null,
            }),
            fieldIssues: [],
          },
        ],
      });

      expect(preview[0]!.changes).toEqual([]);
      expect(preview[0]!.action).toBe("unchanged");
    });
  });
});
