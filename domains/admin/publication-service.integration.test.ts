import { describe, expect, it } from "vitest";

import { userItemProgress } from "@/db/schema";
import {
  DEVELOPER_ID,
  ITEM_AGUA_ID,
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  VOCAB_GROUP_ID,
  seedTestFixtures,
} from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  getDraft,
  getVocabularyDictionaryFields,
  lockLearningItemForEdit,
} from "@/domains/curriculum/curriculum-mutation-repository";
import { AdminError } from "@/lib/errors/admin-errors";
import { eq } from "drizzle-orm";

import { getAuditEvents } from "./audit-repository";
import {
  applyDictionaryFieldsToItem,
  archiveItem,
  resetDictionaryFieldOverride,
  createItem,
  deleteItem,
  moveItem,
  publishItem,
  reorderItems,
  updateItem,
} from "./publication-service";

function vocabFields(term: string, meaning: string) {
  return {
    vocabularyGroupId: VOCAB_GROUP_ID,
    term,
    primaryMeaning: meaning,
    article: "el",
    partOfSpeech: "noun",
    acceptedAnswers: [],
  };
}

describe("createItem", () => {
  it("creates a pending item and records a CURRICULUM_ITEM_CREATED audit event", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("pajaro", "bird"),
      });

      const locked = await lockLearningItemForEdit(tx, learningItemId);
      expect(locked?.status).toBe("pending");

      const audit = await getAuditEvents(tx, { limit: 10 });
      expect(
        audit.items.some(
          (e) =>
            e.action === "CURRICULUM_ITEM_CREATED" &&
            e.resourceId === learningItemId,
        ),
      ).toBe(true);
    });
  });

  it("blocks creating an exact-normalized duplicate, and lists the matching candidate", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const attempt = createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("GATO", "housecat"), // case-variant of the seeded "gato"
      });

      await expect(attempt).rejects.toThrow(AdminError);
      await expect(attempt.catch((e) => e)).resolves.toMatchObject({
        code: "DUPLICATE_ITEM",
        details: { candidates: [{ learningItemId: ITEM_GATO_ID }] },
      });
    });
  });

  it("never conflates an accented term with its unaccented spelling as duplicates", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      // Deliberately not the real "sí"/"si" pair this once described: "sí"
      // is real Level 1 curriculum in this database (`TEST_DATABASE_URL` and
      // `DATABASE_URL` are the same one), so creating it here would be
      // blocked as a genuine duplicate and prove nothing about accents.
      // These two spellings exist only for this test.
      await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: VOCAB_GROUP_ID,
          term: "fíxtura",
          primaryMeaning: "fixture (accented)",
          partOfSpeech: "noun",
          acceptedAnswers: [],
        },
      });

      // The unaccented spelling is a different word and must not be blocked.
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: VOCAB_GROUP_ID,
          term: "fixtura",
          primaryMeaning: "fixture (plain)",
          partOfSpeech: "noun",
          acceptedAnswers: [],
        },
      });
      expect(await lockLearningItemForEdit(tx, learningItemId)).not.toBeNull();
    });
  });

  it("allows a homonym duplicate when explicitly approved, and records DUPLICATE_APPROVED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);

      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        approvedAsHomonymOf: ITEM_GATO_ID,
        type: "vocabulary",
        fields: vocabFields("gato", "slang for a sly person"),
      });

      const audit = await getAuditEvents(tx, {
        action: "DUPLICATE_APPROVED",
        limit: 10,
      });
      expect(audit.items.some((e) => e.resourceId === learningItemId)).toBe(
        true,
      );
    });
  });

  it("replaying the same idempotency key and payload does not create a second item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();
      const input = {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey,
        type: "vocabulary" as const,
        fields: vocabFields("nube", "cloud"),
      };

      const first = await createItem(tx, input);
      const second = await createItem(tx, input);
      expect(second.learningItemId).toBe(first.learningItemId);

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_CREATED",
        resourceId: first.learningItemId,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
    });
  });
});

describe("updateItem", () => {
  it("updates a pending item's fields directly, with no draft involved", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("nube", "cloud"),
      });

      const result = await updateItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("nube", "cloud (updated)"),
      });

      expect(result.savedAsDraft).toBe(false);
      expect(await getDraft(tx, learningItemId)).toBeNull();
    });
  });

  it("editing an already-published item creates a draft instead of mutating the live row", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);

      const result = await updateItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("gato", "cat (draft edit)"),
      });

      expect(result.savedAsDraft).toBe(true);
      const draft = await getDraft(tx, ITEM_GATO_ID);
      expect(draft?.data.fields.primaryMeaning).toBe("cat (draft edit)");
    });
  });

  it("rejects editing an archived item", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      await archiveItem(tx, {
        learningItemId: ITEM_CASA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });

      await expect(
        updateItem(tx, {
          learningItemId: ITEM_CASA_ID,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          type: "vocabulary",
          fields: vocabFields("casa", "house"),
        }),
      ).rejects.toMatchObject({ code: "CURRICULUM_VALIDATION_FAILED" });
    });
  });
});

describe("publishItem", () => {
  it("publishes a pending item and bumps its version", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("estrella", "star"),
      });
      const before = await lockLearningItemForEdit(tx, learningItemId);

      await publishItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        expectedVersion: before!.version,
        idempotencyKey: crypto.randomUUID(),
      });

      const after = await lockLearningItemForEdit(tx, learningItemId);
      expect(after?.status).toBe("published");
      expect(after?.version).toBe(before!.version + 1);
    });
  });

  it("rejects a stale expectedVersion with ADMIN_EDIT_CONFLICT, exactly the spec's example", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const staleVersion = (await lockLearningItemForEdit(tx, ITEM_AGUA_ID))!
        .version;

      // Admin B publishes first (a draft, via update then publish).
      await updateItem(tx, {
        learningItemId: ITEM_AGUA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("agua", "water (edited)"),
      });
      await publishItem(tx, {
        learningItemId: ITEM_AGUA_ID,
        actorUserId: DEVELOPER_ID,
        expectedVersion: staleVersion,
        idempotencyKey: crypto.randomUUID(),
      });

      // Admin A, still holding the pre-publish version, tries to publish against it.
      await expect(
        publishItem(tx, {
          learningItemId: ITEM_AGUA_ID,
          actorUserId: DEVELOPER_ID,
          expectedVersion: staleVersion,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "ADMIN_EDIT_CONFLICT" });
    });
  });

  it("publishing a draft applies it to the live item and the status stays published throughout", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);
      const before = await lockLearningItemForEdit(tx, ITEM_GATO_ID);

      await updateItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("gato", "cat (v2)"),
      });
      await publishItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        expectedVersion: before!.version,
        idempotencyKey: crypto.randomUUID(),
      });

      const after = await lockLearningItemForEdit(tx, ITEM_GATO_ID);
      expect(after?.status).toBe("published");
      expect(after?.version).toBe(before!.version + 1);
      expect(await getDraft(tx, ITEM_GATO_ID)).toBeNull();
    });
  });
});

describe("deleteItem", () => {
  it("deletes an unreferenced item and records CURRICULUM_ITEM_DELETED", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: vocabFields("nube", "cloud"),
      });

      const result = await deleteItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.outcome).toBe("deleted");
      expect(await lockLearningItemForEdit(tx, learningItemId)).toBeNull();
    });
  });

  it("falls back to archiving a referenced item, and the transaction stays usable afterward", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);

      // The audit log is append-only and never rolled back, so real archive
      // events for this fixture item accumulate in the shared database. The
      // assertion below is a delta, not an absolute count.
      const archivedBefore = (
        await getAuditEvents(tx, {
          action: "CURRICULUM_ITEM_ARCHIVED",
          resourceId: ITEM_GATO_ID,
          limit: 10,
        })
      ).items.length;

      const result = await deleteItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.outcome).toBe("archived");

      const locked = await lockLearningItemForEdit(tx, ITEM_GATO_ID);
      expect(locked?.status).toBe("archived");
      const [progress] = await tx
        .select()
        .from(userItemProgress)
        .where(eq(userItemProgress.learningItemId, ITEM_GATO_ID));
      expect(progress).toBeDefined(); // learner progress survived

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_ARCHIVED",
        resourceId: ITEM_GATO_ID,
        limit: 10,
      });
      expect(audit.items.length).toBe(archivedBefore + 1);
    });
  });
});

describe("moveItem and reorderItems", () => {
  it("moves an item and records CURRICULUM_ITEM_MOVED with before/after level", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      await moveItem(tx, {
        learningItemId: ITEM_CASA_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        levelId: level1Id,
      });

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_MOVED",
        resourceId: ITEM_CASA_ID,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
    });
  });

  it("reorders a level's items and records one CURRICULUM_ITEM_REORDERED event for the whole batch", async () => {
    await withTestTransaction(async (tx) => {
      const { level1Id } = await seedTestFixtures(tx);
      await reorderItems(tx, {
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        levelId: level1Id,
        type: "vocabulary",
        orderedLearningItemIds: [ITEM_CASA_ID, ITEM_GATO_ID, ITEM_AGUA_ID],
      });

      expect((await lockLearningItemForEdit(tx, ITEM_CASA_ID))?.position).toBe(
        1,
      );
      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_REORDERED",
        resourceId: level1Id,
        limit: 10,
      });
      expect(audit.items).toHaveLength(1);
    });
  });
});

describe("applyDictionaryFieldsToItem", () => {
  const dictionaryFields = {
    partOfSpeech: "noun",
    definition: "a domesticated feline",
    ipa: "/ˈɡa.to/",
  };

  it("fills a pending item's blank fields in place, and records what it replaced", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      // A pending item shaped exactly like a CSV import leaves one: no part
      // of speech, no definition, no IPA.
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: VOCAB_GROUP_ID,
          term: "gatito",
          primaryMeaning: "kitten",
          partOfSpeech: "",
          acceptedAnswers: [],
        },
      });

      const result = await applyDictionaryFieldsToItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        fields: dictionaryFields,
      });
      expect(result).toEqual({ applied: true, savedAsDraft: false });

      const stored = await getVocabularyDictionaryFields(tx, learningItemId);
      expect(stored).toMatchObject(dictionaryFields);
      // The graded answer and the term are never touched.
      expect(stored?.primaryMeaning).toBe("kitten");
      expect(stored?.term).toBe("gatito");

      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_UPDATED",
        resourceId: learningItemId,
        limit: 10,
      });
      expect(audit.items[0]?.beforeData).toMatchObject({
        partOfSpeech: "",
        definition: null,
        ipa: null,
      });
    });
  });

  it("routes a published item through its draft rather than editing live curriculum", async () => {
    await withTestTransaction(async (tx) => {
      await seedTestFixtures(tx);

      const result = await applyDictionaryFieldsToItem(tx, {
        learningItemId: ITEM_GATO_ID,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        fields: dictionaryFields,
      });
      expect(result).toEqual({ applied: true, savedAsDraft: true });

      // The live row is untouched until someone publishes the draft.
      const live = await getVocabularyDictionaryFields(tx, ITEM_GATO_ID);
      expect(live?.definition).not.toBe(dictionaryFields.definition);

      const draft = await getDraft(tx, ITEM_GATO_ID);
      expect(draft?.data).toMatchObject({
        type: "vocabulary",
        fields: { ...dictionaryFields, term: "gato", primaryMeaning: "cat" },
      });
    });
  });

  it("leaves a field the dictionary has no value for alone", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: VOCAB_GROUP_ID,
          term: "gatuno",
          primaryMeaning: "feline",
          partOfSpeech: "adjective",
          creatorNotes: "authored note",
          acceptedAnswers: [],
        },
      });

      await applyDictionaryFieldsToItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        fields: {
          partOfSpeech: null,
          definition: "of or relating to cats",
          ipa: null,
        },
      });

      const stored = await getVocabularyDictionaryFields(tx, learningItemId);
      expect(stored?.definition).toBe("of or relating to cats");
      expect(stored?.partOfSpeech).toBe("adjective");
      expect(stored?.creatorNotes).toBe("authored note");
    });
  });

  it("does nothing, and records nothing, when the values already match", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id } = await seedTestFixtures(tx);
      const { learningItemId } = await createItem(tx, {
        languageId,
        levelId: level1Id,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        type: "vocabulary",
        fields: {
          vocabularyGroupId: VOCAB_GROUP_ID,
          term: "gatear",
          primaryMeaning: "to crawl",
          partOfSpeech: "verb",
          acceptedAnswers: [],
        },
      });

      const result = await applyDictionaryFieldsToItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        fields: { partOfSpeech: "verb", definition: null, ipa: null },
      });

      expect(result).toEqual({ applied: false, savedAsDraft: false });
      const audit = await getAuditEvents(tx, {
        action: "CURRICULUM_ITEM_UPDATED",
        resourceId: learningItemId,
        limit: 10,
      });
      expect(audit.items).toHaveLength(0);
    });
  });

  it("refuses a grammar item — grammar has no dictionary integration", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      await expect(
        applyDictionaryFieldsToItem(tx, {
          learningItemId: grammarYId,
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
          fields: dictionaryFields,
        }),
      ).rejects.toBeInstanceOf(AdminError);
    });
  });
});

describe("manual overrides of dictionary-supplied fields (spec 17)", () => {
  const dictionaryFields = {
    partOfSpeech: "noun",
    definition: "a domesticated feline",
    ipa: "/ˈɡa.to/",
  };

  async function pendingItem(
    tx: Parameters<Parameters<typeof withTestTransaction>[0]>[0],
    term: string,
  ) {
    const { languageId, level1Id } = await seedTestFixtures(tx);
    const { learningItemId } = await createItem(tx, {
      languageId,
      levelId: level1Id,
      actorUserId: DEVELOPER_ID,
      idempotencyKey: crypto.randomUUID(),
      type: "vocabulary",
      fields: {
        vocabularyGroupId: VOCAB_GROUP_ID,
        term,
        primaryMeaning: "meaning",
        partOfSpeech: "",
        acceptedAnswers: [],
      },
    });
    await applyDictionaryFieldsToItem(tx, {
      learningItemId,
      actorUserId: DEVELOPER_ID,
      idempotencyKey: crypto.randomUUID(),
      fields: dictionaryFields,
    });
    return learningItemId;
  }

  /** Saves the editor form with one dictionary-backed field changed. */
  async function editTeachingMeaning(
    tx: Parameters<Parameters<typeof withTestTransaction>[0]>[0],
    learningItemId: string,
    term: string,
    definition: string,
  ) {
    await updateItem(tx, {
      learningItemId,
      actorUserId: DEVELOPER_ID,
      idempotencyKey: crypto.randomUUID(),
      type: "vocabulary",
      fields: {
        vocabularyGroupId: VOCAB_GROUP_ID,
        term,
        primaryMeaning: "meaning",
        partOfSpeech: "noun",
        ipa: "/ˈɡa.to/",
        definition,
        acceptedAnswers: [],
      },
    });
  }

  it("marks only the field an author actually changed", async () => {
    await withTestTransaction(async (tx) => {
      const learningItemId = await pendingItem(tx, "gatito-override");
      await editTeachingMeaning(
        tx,
        learningItemId,
        "gatito-override",
        "a small cat, taught this way on purpose",
      );

      const stored = await getVocabularyDictionaryFields(tx, learningItemId);
      expect(stored?.dictionaryFieldOverrides).toEqual(["definition"]);
      // Editing the teaching meaning must not freeze the IPA.
      expect(stored?.dictionaryFieldOverrides).not.toContain("ipa");
    });
  });

  it("does not mark a field when the form is saved unchanged", async () => {
    await withTestTransaction(async (tx) => {
      const learningItemId = await pendingItem(tx, "gatito-unchanged");
      await editTeachingMeaning(
        tx,
        learningItemId,
        "gatito-unchanged",
        dictionaryFields.definition,
      );

      const stored = await getVocabularyDictionaryFields(tx, learningItemId);
      expect(stored?.dictionaryFieldOverrides).toEqual([]);
    });
  });

  it("never lets a later promotion overwrite an authored field", async () => {
    await withTestTransaction(async (tx) => {
      const learningItemId = await pendingItem(tx, "gatito-protected");
      await editTeachingMeaning(
        tx,
        learningItemId,
        "gatito-protected",
        "authored meaning",
      );

      // The admin changes the selected sense, so promotion runs again with a
      // different gloss — and an IPA the author never touched.
      await applyDictionaryFieldsToItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        fields: {
          partOfSpeech: "noun",
          definition: "a completely different sense",
          ipa: "/ˈɡa.to.NEW/",
        },
      });

      const stored = await getVocabularyDictionaryFields(tx, learningItemId);
      expect(stored?.definition).toBe("authored meaning");
      expect(stored?.ipa).toBe("/ˈɡa.to.NEW/");
    });
  });

  it("reset hands the field back, so the next promotion writes it again", async () => {
    await withTestTransaction(async (tx) => {
      const learningItemId = await pendingItem(tx, "gatito-reset");
      await editTeachingMeaning(
        tx,
        learningItemId,
        "gatito-reset",
        "authored meaning",
      );

      await resetDictionaryFieldOverride(tx, {
        learningItemId,
        field: "definition",
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(
        (await getVocabularyDictionaryFields(tx, learningItemId))
          ?.dictionaryFieldOverrides,
      ).toEqual([]);

      await applyDictionaryFieldsToItem(tx, {
        learningItemId,
        actorUserId: DEVELOPER_ID,
        idempotencyKey: crypto.randomUUID(),
        fields: dictionaryFields,
      });
      expect(
        (await getVocabularyDictionaryFields(tx, learningItemId))?.definition,
      ).toBe(dictionaryFields.definition);
    });
  });

  it("refuses to reset a field on a grammar item", async () => {
    await withTestTransaction(async (tx) => {
      const { grammarYId } = await seedTestFixtures(tx);
      await expect(
        resetDictionaryFieldOverride(tx, {
          learningItemId: grammarYId,
          field: "definition",
          actorUserId: DEVELOPER_ID,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toBeInstanceOf(AdminError);
    });
  });
});
