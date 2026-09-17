import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getAuditEvents } from "@/domains/admin/audit-repository";
import {
  dictionaryEntries,
  dictionaryEntryVersions,
  dictionaryForms,
  dictionaryPronunciations,
  dictionaryRegionalEvidence,
  dictionaryRelations,
  dictionarySenses,
  languages,
  learningItems,
  levels,
  userItemProgress,
  userLevelProgress,
  users,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { LexiconError } from "@/lib/errors/lexicon-errors";

import { runRegionalImport } from "./import/rla-import";
import { runDictionaryImport } from "./import/wiktextract-import";
import {
  LEXICAL_SOURCE_DEFINITIONS,
  RLA_ES_MX_SOURCE_CODE,
  WIKTIONARY_ES_SOURCE_CODE,
} from "./lexical-source-registry";
import {
  bulkConfirmVocabularyMappings,
  confirmVocabularyMapping,
  matchAllVocabularyItems,
  matchImportedVocabularyItems,
  matchVocabularyItem,
  selectDictionaryEntry,
  selectVocabularySenses,
} from "./lexicon-mapping-service";
import {
  flagMappingsNeedingReview,
  getMapping,
  getSelectedSenseIds,
} from "./lexicon-repository";
import { refreshRegionalEvidence } from "./regional-evidence";

/**
 * Spec 12's integration list, run against the real integration database with
 * transaction-per-test rollback (spec 08 §42) — real constraints, real
 * upserts, nothing persisted.
 *
 * Fixture dumps are written to a temp directory per test rather than read
 * from `/data-sources`, so each case controls exactly what the "source"
 * publishes and a reimport can genuinely differ from the first import.
 *
 * **Every test creates its own language and its own curriculum item**, and
 * every regional test uses its own region code, rather than reusing
 * `seedTestFixtures`' shared `es-MX` rows. `TEST_DATABASE_URL` and
 * `DATABASE_URL` currently resolve to the same Neon branch (see
 * `db/test/test-client.ts` and progress-tracker.md), so any committed dev
 * data — including a real `npm run lexicon:import` run — is visible inside
 * the test transaction. Assertions like "exactly one `gato` entry exists"
 * are only meaningful when the fixture owns its own scope; this is the same
 * shared-branch condition already recorded against the audit-log tests, met
 * head-on rather than worked around.
 */

const DICTIONARY_SOURCE = LEXICAL_SOURCE_DEFINITIONS[WIKTIONARY_ES_SOURCE_CODE];
const REGIONAL_SOURCE = LEXICAL_SOURCE_DEFINITIONS[RLA_ES_MX_SOURCE_CODE];

const directory = mkdtempSync(join(tmpdir(), "polyglot-lexicon-"));
let fixtureCounter = 0;

/** Writes a JSONL dump. A unique filename per call keeps checksums distinct, so "the same snapshot" means what it says. */
function writeDump(records: unknown[]): string {
  fixtureCounter += 1;
  const path = join(directory, `dump-${fixtureCounter}.jsonl`);
  writeFileSync(
    path,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8",
  );
  return path;
}

/**
 * A language, level, group, and one vocabulary item that exist only inside
 * this test's transaction. The language code keeps the `es-` prefix so it
 * still resolves to the Spanish provider and the Wiktionary source by base
 * subtag — the isolation is in the id, not in different behavior.
 */
async function seedIsolatedFixture(tx: TestTx) {
  fixtureCounter += 1;
  const suffix = `${fixtureCounter}${Math.floor(Math.random() * 100000)}`;

  const [language] = await tx
    .insert(languages)
    .values({
      code: `es-T${suffix}`,
      slug: `spanish-test-${suffix}`,
      name: `Spanish (test ${suffix})`,
    })
    .returning();
  const [level] = await tx
    .insert(levels)
    .values({
      languageId: language.id,
      levelNumber: 1,
      name: "Level 1",
      status: "published",
    })
    .returning();
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({
      levelId: level.id,
      languageId: language.id,
      name: "Animals",
      position: 1,
      status: "published",
    })
    .returning();
  const [item] = await tx
    .insert(learningItems)
    .values({
      languageId: language.id,
      levelId: level.id,
      type: "vocabulary",
      status: "published",
      position: 1,
      lessonPriority: 1,
    })
    .returning();
  await tx.insert(vocabularyItems).values({
    learningItemId: item.id,
    vocabularyGroupId: group.id,
    term: "gato",
    primaryMeaning: "cat",
    article: "el",
    partOfSpeech: "noun",
  });

  // Two users of this fixture's own, rather than `seedTestFixtures`' shared
  // ones: the audit and idempotency tables both have a foreign key to
  // `users`, and re-seeding the whole shared fixture set on every test was
  // by far the slowest thing in this file.
  const [admin] = await tx
    .insert(users)
    .values({
      clerkUserId: `lexicon-test-admin-${suffix}`,
      role: "admin",
      activeLanguageId: language.id,
    })
    .returning();
  const [learner] = await tx
    .insert(users)
    .values({
      clerkUserId: `lexicon-test-learner-${suffix}`,
      role: "user",
      activeLanguageId: language.id,
    })
    .returning();

  return {
    languageId: language.id,
    levelId: level.id,
    groupId: group.id,
    vocabularyItemId: item.id,
    adminUserId: admin.id,
    learnerUserId: learner.id,
    regionCode: `es-R${suffix}`,
  };
}

/** A second vocabulary item in an already-`seedIsolatedFixture`'d language/level/group — for tests that need to prove batch functions act on exactly the given items, not every item nearby. */
async function addVocabularyItem(
  tx: TestTx,
  {
    languageId,
    levelId,
    groupId,
  }: { languageId: string; levelId: string; groupId: string },
  term: string,
  primaryMeaning: string,
) {
  const [item] = await tx
    .insert(learningItems)
    .values({
      languageId,
      levelId,
      type: "vocabulary",
      status: "published",
      position: 2,
      lessonPriority: 2,
    })
    .returning();
  await tx.insert(vocabularyItems).values({
    learningItemId: item.id,
    vocabularyGroupId: groupId,
    term,
    primaryMeaning,
    partOfSpeech: "noun",
  });
  return item.id;
}

function writeWordList(words: string[]): string {
  fixtureCounter += 1;
  const stem = `words-${fixtureCounter}`;
  writeFileSync(join(directory, `${stem}.aff`), "SET UTF-8\n", "utf8");
  writeFileSync(
    join(directory, `${stem}.dic`),
    `${words.length}\n${words.join("\n")}\n`,
    "utf8",
  );
  return stem;
}

const GATO_RECORD = {
  word: "gato",
  lang_code: "es",
  pos: "noun",
  senses: [
    { glosses: ["cat"], id: "gato-cat", tags: ["masculine"] },
    { glosses: ["jack (lifting device)"], id: "gato-jack" },
  ],
  forms: [{ form: "gatos", tags: ["plural"] }],
  sounds: [{ ipa: "/ˈga.to/" }],
  synonyms: [{ word: "minino" }],
};

async function importDictionary(
  tx: TestTx,
  languageId: string,
  records: unknown[],
  scope: "curriculum" | "full_language" = "full_language",
) {
  return runDictionaryImport(tx, {
    filePath: writeDump(records),
    languageId,
    languageCode: "es-MX",
    sourceDefinition: DICTIONARY_SOURCE,
    scope,
    now: new Date(),
  });
}

describe("dictionary import", () => {
  it("persists entries, the raw source version, and the full relational projection", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedIsolatedFixture(tx);

      const result = await importDictionary(tx, languageId, [GATO_RECORD]);
      expect(result.alreadyImported).toBe(false);
      expect(result.entriesCreated).toBe(1);

      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      expect(entry.lemma).toBe("gato");
      expect(entry.partOfSpeech).toBe("noun");
      expect(entry.sourceStatus).toBe("active");

      const versions = await tx
        .select()
        .from(dictionaryEntryVersions)
        .where(eq(dictionaryEntryVersions.dictionaryEntryId, entry.id));
      expect(versions).toHaveLength(1);
      expect((versions[0].rawData as { word: string }).word).toBe("gato");

      const senses = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, entry.id));
      expect(senses.map((sense) => sense.gloss).sort()).toEqual([
        "cat",
        "jack (lifting device)",
      ]);

      const forms = await tx
        .select()
        .from(dictionaryForms)
        .where(eq(dictionaryForms.dictionaryEntryId, entry.id));
      expect(forms.map((form) => form.normalizedForm)).toEqual(["gatos"]);

      const pronunciations = await tx
        .select()
        .from(dictionaryPronunciations)
        .where(eq(dictionaryPronunciations.dictionaryEntryId, entry.id));
      expect(pronunciations[0].ipa).toBe("/ˈga.to/");

      const relations = await tx
        .select()
        .from(dictionaryRelations)
        .where(eq(dictionaryRelations.dictionaryEntryId, entry.id));
      expect(
        relations.map((relation) => [
          relation.relationType,
          relation.targetLemma,
        ]),
      ).toEqual([["synonym", "minino"]]);
    });
  });

  it("is idempotent: the same snapshot imported twice creates nothing new", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedIsolatedFixture(tx);
      const path = writeDump([GATO_RECORD]);

      const first = await runDictionaryImport(tx, {
        filePath: path,
        languageId,
        languageCode: "es-MX",
        sourceDefinition: DICTIONARY_SOURCE,
        scope: "full_language",
        now: new Date(),
      });
      const second = await runDictionaryImport(tx, {
        filePath: path,
        languageId,
        languageCode: "es-MX",
        sourceDefinition: DICTIONARY_SOURCE,
        scope: "full_language",
        now: new Date(),
      });

      expect(second.alreadyImported).toBe(true);
      expect(second.importId).toBe(first.importId);

      const entries = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      expect(entries).toHaveLength(1);
      const versions = await tx
        .select()
        .from(dictionaryEntryVersions)
        .where(eq(dictionaryEntryVersions.dictionaryEntryId, entries[0].id));
      expect(versions).toHaveLength(1);
    });
  });

  it("counts a malformed row and an unusable record as rejected without aborting the import", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedIsolatedFixture(tx);
      fixtureCounter += 1;
      const path = join(directory, `mixed-${fixtureCounter}.jsonl`);
      writeFileSync(
        path,
        [
          JSON.stringify(GATO_RECORD),
          '{"word": "roto", "senses": [',
          JSON.stringify({
            word: "x",
            lang_code: "es",
            pos: "noun",
            senses: [],
          }),
        ].join("\n") + "\n",
        "utf8",
      );

      const result = await runDictionaryImport(tx, {
        filePath: path,
        languageId,
        languageCode: "es-MX",
        sourceDefinition: DICTIONARY_SOURCE,
        scope: "full_language",
        now: new Date(),
      });

      expect(result.recordsScanned).toBe(3);
      expect(result.recordsRetained).toBe(1);
      expect(result.recordsRejected).toBe(2);
    });
  });

  it("never modifies curriculum, progress, or SRS state", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, levelId, vocabularyItemId, learnerUserId } =
        await seedIsolatedFixture(tx);

      // Enrolled progress and an unlocked level, so the snapshot comparison
      // is about real rows an import could plausibly damage.
      await tx.insert(userItemProgress).values({
        userId: learnerUserId,
        learningItemId: vocabularyItemId,
        languageId,
        srsStage: "beginner_1",
      });
      await tx
        .insert(userLevelProgress)
        .values({ userId: learnerUserId, levelId, unlockedAt: new Date() });

      const before = {
        items: await tx
          .select()
          .from(learningItems)
          .where(eq(learningItems.languageId, languageId)),
        vocabulary: await tx
          .select()
          .from(vocabularyItems)
          .where(eq(vocabularyItems.learningItemId, vocabularyItemId)),
        itemProgress: await tx
          .select()
          .from(userItemProgress)
          .where(eq(userItemProgress.userId, learnerUserId)),
        levelProgress: await tx
          .select()
          .from(userLevelProgress)
          .where(eq(userLevelProgress.userId, learnerUserId)),
      };

      await importDictionary(tx, languageId, [GATO_RECORD]);

      const after = {
        items: await tx
          .select()
          .from(learningItems)
          .where(eq(learningItems.languageId, languageId)),
        vocabulary: await tx
          .select()
          .from(vocabularyItems)
          .where(eq(vocabularyItems.learningItemId, vocabularyItemId)),
        itemProgress: await tx
          .select()
          .from(userItemProgress)
          .where(eq(userItemProgress.userId, learnerUserId)),
        levelProgress: await tx
          .select()
          .from(userLevelProgress)
          .where(eq(userLevelProgress.userId, learnerUserId)),
      };

      // Spec 12's hardest boundary: a dictionary release cannot reorganize
      // curriculum, reset SRS, or touch learner progress.
      expect(after).toEqual(before);
    });
  });
});

describe("reimport", () => {
  it("preserves the internal entry id and retains the previous raw version", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      const [before] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );

      await importDictionary(tx, languageId, [
        {
          ...GATO_RECORD,
          senses: [
            { glosses: ["cat (domestic feline)"], id: "gato-cat" },
            { glosses: ["jack (lifting device)"], id: "gato-jack" },
          ],
        },
      ]);

      const [after] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      expect(after.id).toBe(before.id);

      const versions = await tx
        .select()
        .from(dictionaryEntryVersions)
        .where(eq(dictionaryEntryVersions.dictionaryEntryId, after.id));
      expect(versions).toHaveLength(2);

      const senses = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, after.id));
      const cat = senses.find((sense) => sense.sourceSenseKey === "gato-cat");
      expect(cat?.gloss).toBe("cat (domestic feline)");
    });
  });

  it("marks a sense that disappeared upstream as missing instead of deleting it", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await importDictionary(tx, languageId, [
        { ...GATO_RECORD, senses: [{ glosses: ["cat"], id: "gato-cat" }] },
      ]);

      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      const senses = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, entry.id));
      expect(senses).toHaveLength(2);
      expect(
        senses.find((sense) => sense.sourceSenseKey === "gato-jack")
          ?.sourceStatus,
      ).toBe("missing_from_source");
      expect(
        senses.find((sense) => sense.sourceSenseKey === "gato-cat")
          ?.sourceStatus,
      ).toBe("active");
    });
  });

  it("marks an entry that disappeared upstream as missing, within the scope actually searched", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await importDictionary(tx, languageId, [
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"] }],
        },
      ]);

      const [gato] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      expect(gato.sourceStatus).toBe("missing_from_source");
    });
  });
});

describe("vocabulary mapping", () => {
  it("auto-matches a seeded vocabulary item to its dictionary entry", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);

      const result = await matchVocabularyItem(tx, vocabularyItemId);
      expect(result.mapping?.matchStatus).toBe("auto_matched");
      expect(result.mapping?.confidence).toBe("high");
      // Seeded as article "el" + term "gato": the lookup resolves through the
      // lemma, not the article-composed display word.
      expect(result.mapping?.lookupForm).toBe("gato");
    });
  });

  it("reports source_data_not_imported before anything has been imported", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId } = await seedIsolatedFixture(tx);
      // The source row must exist for the matcher to run at all; importing an
      // unrelated language's records registers it while leaving Spanish empty.
      await importDictionary(tx, languageId, [
        {
          word: "chien",
          lang_code: "fr",
          pos: "noun",
          senses: [{ glosses: ["dog"] }],
        },
      ]);

      const result = await matchVocabularyItem(tx, vocabularyItemId);
      expect(result.mapping?.matchStatus).toBe("source_data_not_imported");
    });
  });

  it("requires review when two homonym entries match", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [
        { ...GATO_RECORD, etymology_number: 1 },
        {
          ...GATO_RECORD,
          etymology_number: 2,
          senses: [{ glosses: ["jack"], id: "gato-2-jack" }],
        },
      ]);

      const result = await matchVocabularyItem(tx, vocabularyItemId);
      expect(result.mapping?.matchStatus).toBe("review_required");
      expect(result.mapping?.reviewReason).toBe("multiple_candidates");
      expect(result.mapping?.dictionaryEntryId).toBeNull();
    });
  });

  it("persists selected senses, and rejects a sense from a different entry", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [
        GATO_RECORD,
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"], id: "casa-house" }],
        },
      ]);
      await matchVocabularyItem(tx, vocabularyItemId);

      const [gatoEntry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      const gatoSenses = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, gatoEntry.id));
      const catSense = gatoSenses.find(
        (sense) => sense.sourceSenseKey === "gato-cat",
      )!;

      await selectVocabularySenses(tx, {
        vocabularyItemId: vocabularyItemId,
        senseIds: [catSense.id],
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(await getSelectedSenseIds(tx, vocabularyItemId)).toEqual([
        catSense.id,
      ]);

      const [casaEntry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "casa"),
          ),
        );
      const [casaSense] = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, casaEntry.id));

      // A client-supplied sense id is a request, never proof.
      await expect(
        selectVocabularySenses(tx, {
          vocabularyItemId: vocabularyItemId,
          senseIds: [casaSense.id],
          actorUserId: adminUserId,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(LexiconError);
    });
  });

  it("locks a manually selected mapping against every later automatic pass", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [
        GATO_RECORD,
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"], id: "casa-house" }],
        },
      ]);

      const [casaEntry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "casa"),
          ),
        );

      // A deliberately "wrong" choice: the point is that nothing automatic
      // may second-guess an admin's explicit decision.
      const manual = await selectDictionaryEntry(tx, {
        vocabularyItemId: vocabularyItemId,
        dictionaryEntryId: casaEntry.id,
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(manual.matchStatus).toBe("manual");
      expect(manual.manualLock).toBe(true);

      const rematch = await matchVocabularyItem(tx, vocabularyItemId);
      expect(rematch.skippedBecauseLocked).toBe(true);

      const bulk = await matchAllVocabularyItems(tx, languageId);
      expect(bulk.skippedLocked).toBeGreaterThan(0);

      const after = await getMapping(tx, vocabularyItemId);
      expect(after?.dictionaryEntryId).toBe(casaEntry.id);
      expect(after?.matchStatus).toBe("manual");
    });
  });

  it("survives a reimport with its mapping and selected senses intact", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await matchVocabularyItem(tx, vocabularyItemId);

      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      const senses = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, entry.id));
      const catSense = senses.find(
        (sense) => sense.sourceSenseKey === "gato-cat",
      )!;
      await selectVocabularySenses(tx, {
        vocabularyItemId: vocabularyItemId,
        senseIds: [catSense.id],
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      await importDictionary(tx, languageId, [
        {
          ...GATO_RECORD,
          senses: [
            { glosses: ["cat, a small domesticated feline"], id: "gato-cat" },
            { glosses: ["jack"], id: "gato-jack" },
          ],
        },
      ]);

      const mapping = await getMapping(tx, vocabularyItemId);
      expect(mapping?.dictionaryEntryId).toBe(entry.id);
      expect(await getSelectedSenseIds(tx, vocabularyItemId)).toEqual([
        catSense.id,
      ]);
    });
  });

  it("escalates to review when a selected sense disappears upstream — never silently picks another", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await matchVocabularyItem(tx, vocabularyItemId);

      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      const senses = await tx
        .select()
        .from(dictionarySenses)
        .where(eq(dictionarySenses.dictionaryEntryId, entry.id));
      const jackSense = senses.find(
        (sense) => sense.sourceSenseKey === "gato-jack",
      )!;
      await selectVocabularySenses(tx, {
        vocabularyItemId: vocabularyItemId,
        senseIds: [jackSense.id],
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      await importDictionary(tx, languageId, [
        { ...GATO_RECORD, senses: [{ glosses: ["cat"], id: "gato-cat" }] },
      ]);
      await flagMappingsNeedingReview(tx);

      const mapping = await getMapping(tx, vocabularyItemId);
      expect(mapping?.matchStatus).toBe("review_required");
      expect(mapping?.reviewReason).toBe("selected_sense_missing");
      // The selection is retained, not quietly swapped for another meaning.
      expect(await getSelectedSenseIds(tx, vocabularyItemId)).toEqual([
        jackSense.id,
      ]);
    });
  });

  it("keeps a manually locked mapping locked while flagging it for review", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await matchVocabularyItem(tx, vocabularyItemId);
      await confirmVocabularyMapping(tx, {
        vocabularyItemId: vocabularyItemId,
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      await importDictionary(tx, languageId, [
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"] }],
        },
      ]);
      await flagMappingsNeedingReview(tx);

      const mapping = await getMapping(tx, vocabularyItemId);
      expect(mapping?.reviewReason).toBe("entry_missing_from_source");
      // Flagged for a human decision, but still un-repointable by anything automatic.
      expect(mapping?.manualLock).toBe(true);
    });
  });

  it("does not reset learner progress when an admin remaps an item", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, vocabularyItemId, adminUserId, learnerUserId } =
        await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [
        GATO_RECORD,
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"], id: "casa-house" }],
        },
      ]);
      const [casaEntry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "casa"),
          ),
        );

      // Real enrolled progress, so "unchanged" is a claim about actual rows
      // rather than about two empty result sets.
      await tx.insert(userItemProgress).values({
        userId: learnerUserId,
        learningItemId: vocabularyItemId,
        languageId,
        srsStage: "familiar_1",
        correctCount: 7,
        reviewCount: 9,
      });

      const progressBefore = await tx
        .select()
        .from(userItemProgress)
        .where(
          and(
            eq(userItemProgress.userId, learnerUserId),
            eq(userItemProgress.learningItemId, vocabularyItemId),
          ),
        );

      await selectDictionaryEntry(tx, {
        vocabularyItemId: vocabularyItemId,
        dictionaryEntryId: casaEntry.id,
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      const progressAfter = await tx
        .select()
        .from(userItemProgress)
        .where(
          and(
            eq(userItemProgress.userId, learnerUserId),
            eq(userItemProgress.learningItemId, vocabularyItemId),
          ),
        );
      expect(progressAfter).toEqual(progressBefore);
      expect(progressAfter[0].srsStage).toBe("familiar_1");
    });
  });
});

describe("regional evidence", () => {
  it("records recognized, not_listed, and unknown as three different answers", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, regionCode } = await seedIsolatedFixture(tx);
      const regionWithoutData = `${regionCode}-NONE`;
      await importDictionary(tx, languageId, [
        GATO_RECORD,
        {
          word: "ordenador",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["computer"] }],
        },
      ]);

      await runRegionalImport(tx, {
        directory,
        fileStem: writeWordList(["gato", "gatos"]),
        regionCode,
        sourceDefinition: REGIONAL_SOURCE,
        now: new Date(),
      });

      const [gato] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      const [ordenador] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "ordenador"),
          ),
        );

      await refreshRegionalEvidence(tx, {
        languageId,
        dictionarySourceId: gato.sourceId,
        // The second region has no imported word list at all, so it must read
        // as unknown rather than as "not listed" — the distinction spec 12
        // insists on, since absence is not proof.
        regionCodes: [regionCode, regionWithoutData],
        now: new Date(),
      });

      const evidence = await tx
        .select()
        .from(dictionaryRegionalEvidence)
        .where(
          inArray(dictionaryRegionalEvidence.dictionaryEntryId, [
            gato.id,
            ordenador.id,
          ]),
        );
      const find = (entryId: string, region: string) =>
        evidence.find(
          (row) =>
            row.dictionaryEntryId === entryId && row.regionCode === region,
        );

      expect(find(gato.id, regionCode)?.status).toBe("recognized");
      expect(find(gato.id, regionCode)?.matchedForm).toBe("gato");
      expect(find(ordenador.id, regionCode)?.status).toBe("not_listed");
      expect(find(gato.id, regionWithoutData)?.status).toBe("unknown");
    });
  });

  it("counts an entry as recognized when the region lists one of its inflected forms", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, regionCode } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await runRegionalImport(tx, {
        directory,
        // Only the plural is listed; the entry is still evidenced.
        fileStem: writeWordList(["gatos"]),
        regionCode,
        sourceDefinition: REGIONAL_SOURCE,
        now: new Date(),
      });

      const [entry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "gato"),
          ),
        );
      await refreshRegionalEvidence(tx, {
        languageId,
        dictionarySourceId: entry.sourceId,
        regionCodes: [regionCode],
        now: new Date(),
      });

      const [evidence] = await tx
        .select()
        .from(dictionaryRegionalEvidence)
        .where(eq(dictionaryRegionalEvidence.dictionaryEntryId, entry.id));
      expect(evidence.status).toBe("recognized");
      expect(evidence.matchedForm).toBe("gatos");
    });
  });

  it("keeps an accented word distinct from its unaccented counterpart in the word list", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, regionCode } = await seedIsolatedFixture(tx);
      await importDictionary(tx, languageId, [
        {
          word: "si",
          lang_code: "es",
          pos: "conj",
          senses: [{ glosses: ["if"] }],
        },
        {
          word: "sí",
          lang_code: "es",
          pos: "adv",
          senses: [{ glosses: ["yes"] }],
        },
      ]);
      await runRegionalImport(tx, {
        directory,
        fileStem: writeWordList(["sí"]),
        regionCode,
        sourceDefinition: REGIONAL_SOURCE,
        now: new Date(),
      });

      const [si] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "si"),
          ),
        );
      const [siAccented] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "sí"),
          ),
        );
      expect(si.id).not.toBe(siAccented.id);

      await refreshRegionalEvidence(tx, {
        languageId,
        dictionarySourceId: si.sourceId,
        regionCodes: [regionCode],
        now: new Date(),
      });

      const evidence = await tx
        .select()
        .from(dictionaryRegionalEvidence)
        .where(
          inArray(dictionaryRegionalEvidence.dictionaryEntryId, [
            si.id,
            siAccented.id,
          ]),
        );
      expect(
        evidence.find((row) => row.dictionaryEntryId === siAccented.id)?.status,
      ).toBe("recognized");
      expect(
        evidence.find((row) => row.dictionaryEntryId === si.id)?.status,
      ).toBe("not_listed");
    });
  });
});

describe("matchImportedVocabularyItems", () => {
  it("matches exactly the given items, leaving a real sibling item in the same language untouched", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, levelId, groupId, vocabularyItemId } =
        await seedIsolatedFixture(tx);
      const otherItemId = await addVocabularyItem(
        tx,
        { languageId, levelId, groupId },
        "perro",
        "dog",
      );
      await importDictionary(tx, languageId, [GATO_RECORD]);

      const result = await matchImportedVocabularyItems(tx, [vocabularyItemId]);

      expect(result.processed).toBe(1);
      expect((await getMapping(tx, vocabularyItemId))?.matchStatus).toBe(
        "auto_matched",
      );
      // Never touched: no mapping row exists for it at all, not even an "unmatched" one.
      expect(await getMapping(tx, otherItemId)).toBeNull();
    });
  });

  it("counts a locked mapping as skipped rather than as a status, across a batch of several items", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, levelId, groupId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      const otherItemId = await addVocabularyItem(
        tx,
        { languageId, levelId, groupId },
        "casa",
        "house",
      );
      await importDictionary(tx, languageId, [
        GATO_RECORD,
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"], id: "casa-house" }],
        },
      ]);
      const [casaEntry] = await tx
        .select()
        .from(dictionaryEntries)
        .where(
          and(
            eq(dictionaryEntries.languageId, languageId),
            eq(dictionaryEntries.normalizedLemma, "casa"),
          ),
        );
      await selectDictionaryEntry(tx, {
        vocabularyItemId: otherItemId,
        dictionaryEntryId: casaEntry.id,
        actorUserId: adminUserId,
        idempotencyKey: crypto.randomUUID(),
      });

      const result = await matchImportedVocabularyItems(tx, [
        vocabularyItemId,
        otherItemId,
      ]);

      expect(result.processed).toBe(2);
      expect(result.skippedLocked).toBe(1);
      expect(result.byStatus.auto_matched).toBe(1);
    });
  });
});

describe("bulkConfirmVocabularyMappings", () => {
  it("confirms every given mapping in one call, sharing a correlationId across the audit trail", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, levelId, groupId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      const otherItemId = await addVocabularyItem(
        tx,
        { languageId, levelId, groupId },
        "casa",
        "house",
      );
      await importDictionary(tx, languageId, [
        GATO_RECORD,
        {
          word: "casa",
          lang_code: "es",
          pos: "noun",
          senses: [{ glosses: ["house"], id: "casa-house" }],
        },
      ]);
      await matchImportedVocabularyItems(tx, [vocabularyItemId, otherItemId]);
      const idempotencyKey = crypto.randomUUID();

      const result = await bulkConfirmVocabularyMappings(tx, {
        vocabularyItemIds: [vocabularyItemId, otherItemId],
        actorUserId: adminUserId,
        idempotencyKey,
      });

      expect(result.confirmed).toEqual([vocabularyItemId, otherItemId]);
      expect((await getMapping(tx, vocabularyItemId))?.matchStatus).toBe(
        "manual",
      );
      expect((await getMapping(tx, otherItemId))?.matchStatus).toBe("manual");

      const audit = await getAuditEvents(tx, {
        action: "DICTIONARY_MAPPING_CONFIRMED",
        limit: 10,
      });
      const forThisBatch = audit.items.filter(
        (event) => event.correlationId === idempotencyKey,
      );
      expect(forThisBatch).toHaveLength(2);
    });
  });

  it("rolls back the whole batch when one item has nothing matched to confirm", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, levelId, groupId, vocabularyItemId, adminUserId } =
        await seedIsolatedFixture(tx);
      // A second item that is never imported/matched, so it has no dictionaryEntryId to confirm.
      const unmatchedItemId = await addVocabularyItem(
        tx,
        { languageId, levelId, groupId },
        "perro",
        "dog",
      );
      await importDictionary(tx, languageId, [GATO_RECORD]);
      await matchImportedVocabularyItems(tx, [vocabularyItemId]);

      await expect(
        bulkConfirmVocabularyMappings(tx, {
          vocabularyItemIds: [vocabularyItemId, unmatchedItemId],
          actorUserId: adminUserId,
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow(LexiconError);

      // The whole batch rolled back — even the item that would have succeeded on its own is still unconfirmed.
      expect((await getMapping(tx, vocabularyItemId))?.matchStatus).toBe(
        "auto_matched",
      );
    });
  });
});
