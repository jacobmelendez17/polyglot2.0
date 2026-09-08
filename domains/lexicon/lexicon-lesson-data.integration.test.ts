import { describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import {
  dictionaryEntries,
  dictionaryPronunciations,
  dictionaryRelations,
  dictionaryRegionalEvidence,
  dictionarySenses,
  learningItems,
  lexicalSources,
  vocabularyDictionaryMappings,
  vocabularyItems,
  vocabularySelectedSenses,
} from "@/db/schema";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getConfirmedDictionaryDataForItems } from "./lexicon-repository";

/**
 * Covers `getConfirmedDictionaryDataForItems` — the batched query
 * `domains/curriculum/curriculum-db-service.ts` calls once per lesson batch
 * to merge "everything the dictionary has" into confirmed vocabulary items
 * (2026-09-07 decision). Builds its own dictionary fixtures directly rather
 * than reusing a real import, since only the shape of confirmed data
 * matters here, not import mechanics (already covered by
 * `lexicon.integration.test.ts`).
 */
describe("getConfirmedDictionaryDataForItems", () => {
  it("returns an empty map when no ids are given", async () => {
    await withTestTransaction(async (tx) => {
      expect(await getConfirmedDictionaryDataForItems(tx, [])).toEqual(new Map());
    });
  });

  it("omits an item with no mapping at all", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const [item] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 99, lessonPriority: 99 })
        .returning();
      await tx.insert(vocabularyItems).values({ learningItemId: item.id, vocabularyGroupId: vocabGroupId, term: "xyzzy", primaryMeaning: "nonsense", partOfSpeech: "noun" });

      const result = await getConfirmedDictionaryDataForItems(tx, [item.id]);
      expect(result.has(item.id)).toBe(false);
    });
  });

  it("omits an item whose mapping exists but is not confirmed (auto_matched)", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const [item] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 99, lessonPriority: 99 })
        .returning();
      await tx.insert(vocabularyItems).values({ learningItemId: item.id, vocabularyGroupId: vocabGroupId, term: "perro", primaryMeaning: "dog", partOfSpeech: "noun" });

      const [source] = await tx
        .insert(lexicalSources)
        .values({ code: "test-source", provider: "Test", sourceType: "dictionary", sourceLanguage: "es", entryLanguage: "en", licenseMetadata: {}, attributionText: "From Test" })
        .returning();
      const [entry] = await tx.insert(dictionaryEntries).values({ languageId, sourceId: source.id, lemma: "perro", normalizedLemma: "perro", partOfSpeech: "noun", sourceEntryKey: "perro#noun#0" }).returning();
      await tx.insert(vocabularyDictionaryMappings).values({ vocabularyItemId: item.id, dictionaryEntryId: entry.id, lookupForm: "perro", matchStatus: "auto_matched", confidence: "high" });

      const result = await getConfirmedDictionaryDataForItems(tx, [item.id]);
      expect(result.has(item.id)).toBe(false);
    });
  });

  it("returns the confirmed mapping's primary sense, preferred pronunciation, synonyms, variants, usage labels, regional evidence, and attribution", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const [item] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 99, lessonPriority: 99 })
        .returning();
      await tx.insert(vocabularyItems).values({ learningItemId: item.id, vocabularyGroupId: vocabGroupId, term: "perro", primaryMeaning: "dog", partOfSpeech: "noun" });

      const [source] = await tx
        .insert(lexicalSources)
        .values({ code: "test-source-2", provider: "Test", sourceType: "dictionary", sourceLanguage: "es", entryLanguage: "en", licenseMetadata: {}, attributionText: "From Test, CC BY-SA 4.0" })
        .returning();
      const [entry] = await tx.insert(dictionaryEntries).values({ languageId, sourceId: source.id, lemma: "perro", normalizedLemma: "perro", partOfSpeech: "noun", sourceEntryKey: "perro#noun#1" }).returning();

      const [primarySense, otherSense] = await tx
        .insert(dictionarySenses)
        .values([
          { dictionaryEntryId: entry.id, sourceSenseKey: "s1", sourceFingerprint: "f1", senseOrder: 0, gloss: "a domesticated canine", tags: ["colloquial"], topics: ["animals"] },
          { dictionaryEntryId: entry.id, sourceSenseKey: "s2", sourceFingerprint: "f2", senseOrder: 1, gloss: "an unrelated sense" },
        ])
        .returning();

      const [preferredPronunciation] = await tx
        .insert(dictionaryPronunciations)
        .values([
          { dictionaryEntryId: entry.id, ipa: "/ˈpe.ro/", regionCode: "es-MX", sourceFingerprint: "p1" },
          { dictionaryEntryId: entry.id, ipa: "/ˈpe.ro-alt/", regionCode: "es-ES", sourceFingerprint: "p2" },
        ])
        .returning();

      await tx.insert(dictionaryRelations).values([
        { dictionaryEntryId: entry.id, relationType: "synonym", targetLemma: "can", normalizedTargetLemma: "can" },
        { dictionaryEntryId: entry.id, relationType: "alternative_form", targetLemma: "perros", normalizedTargetLemma: "perros" },
      ]);

      await tx.insert(dictionaryRegionalEvidence).values({ dictionaryEntryId: entry.id, regionCode: "es-MX", status: "recognized", matchedForm: "perro" });

      await tx.insert(vocabularyDictionaryMappings).values({
        vocabularyItemId: item.id,
        dictionaryEntryId: entry.id,
        lookupForm: "perro",
        matchStatus: "manual",
        confidence: "high",
        preferredPronunciationId: preferredPronunciation.id,
      });
      await tx.insert(vocabularySelectedSenses).values({ vocabularyItemId: item.id, dictionarySenseId: primarySense.id, position: 0 });

      const result = await getConfirmedDictionaryDataForItems(tx, [item.id]);
      const data = result.get(item.id);

      expect(data).toBeDefined();
      expect(data?.lemma).toBe("perro");
      expect(data?.definition).toBe("a domesticated canine");
      expect(data?.ipa).toBe("/ˈpe.ro/");
      expect(data?.synonyms).toEqual(["can"]);
      expect(data?.variants).toEqual(["perros"]);
      expect(data?.usageLabels).toEqual(["animals", "colloquial"]);
      expect(data?.regionalEvidence).toEqual([{ regionCode: "es-MX", status: "recognized", matchedForm: "perro", evaluatedAt: expect.any(Date) }]);
      expect(data?.attribution?.attributionText).toBe("From Test, CC BY-SA 4.0");
      expect(otherSense.gloss).toBe("an unrelated sense"); // sanity: the unselected sense exists but is never chosen as `definition`
    });
  });

  it("falls back to the entry's first pronunciation when preferredPronunciationId doesn't match any of the entry's pronunciations", async () => {
    await withTestTransaction(async (tx) => {
      const { languageId, level1Id, vocabGroupId } = await seedTestFixtures(tx);
      const [item] = await tx
        .insert(learningItems)
        .values({ languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 99, lessonPriority: 99 })
        .returning();
      await tx.insert(vocabularyItems).values({ learningItemId: item.id, vocabularyGroupId: vocabGroupId, term: "gata", primaryMeaning: "female cat", partOfSpeech: "noun" });

      const [source] = await tx
        .insert(lexicalSources)
        .values({ code: "test-source-3", provider: "Test", sourceType: "dictionary", sourceLanguage: "es", entryLanguage: "en", licenseMetadata: {}, attributionText: "From Test" })
        .returning();
      const [entry] = await tx.insert(dictionaryEntries).values({ languageId, sourceId: source.id, lemma: "gata", normalizedLemma: "gata", partOfSpeech: "noun", sourceEntryKey: "gata#noun#0" }).returning();
      const [pronunciation] = await tx.insert(dictionaryPronunciations).values({ dictionaryEntryId: entry.id, ipa: "/ˈga.ta/", sourceFingerprint: "p1" }).returning();

      await tx.insert(vocabularyDictionaryMappings).values({
        vocabularyItemId: item.id,
        dictionaryEntryId: entry.id,
        lookupForm: "gata",
        matchStatus: "manual",
        confidence: "high",
        preferredPronunciationId: null,
      });

      const result = await getConfirmedDictionaryDataForItems(tx, [item.id]);
      expect(result.get(item.id)?.ipa).toBe(pronunciation.ipa);
    });
  });
});
