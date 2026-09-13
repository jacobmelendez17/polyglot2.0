import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { languages, learningItems, levels, userLevelProgress, users, vocabularyGroups, vocabularyItems } from "@/db/schema";
import type { TestTx } from "@/db/test/with-test-transaction";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { getEligibleLessonItems } from "./lesson-curriculum-repository";

/**
 * Spec 20 General — NSFW Content: "NSFW lesson items are not selected."
 * Every test builds its own language/level/user, matching
 * `domains/lessons/lesson-completion.integration.test.ts`'s established
 * reasoning — `TEST_DATABASE_URL` shares a Neon branch with `DATABASE_URL`,
 * so a scoped fixture is the only way counts/membership are meaningful.
 */

let counter = 0;

async function seedLessonFixture(tx: TestTx) {
  counter += 1;
  const suffix = `${counter}${Math.floor(Math.random() * 100000)}`;

  const [language] = await tx
    .insert(languages)
    .values({ code: `es-N${suffix}`, slug: `spanish-nsfw-${suffix}`, name: `Spanish (nsfw ${suffix})` })
    .returning();
  const [level] = await tx
    .insert(levels)
    .values({ languageId: language.id, levelNumber: 1, name: "Level 1", status: "published" })
    .returning();
  const [group] = await tx
    .insert(vocabularyGroups)
    .values({ levelId: level.id, languageId: language.id, name: "Basics", position: 1, status: "published" })
    .returning();
  const [user] = await tx
    .insert(users)
    .values({ clerkUserId: `nsfw-lesson-test-${suffix}`, role: "user", activeLanguageId: language.id })
    .returning();
  await tx.insert(userLevelProgress).values({ userId: user.id, levelId: level.id, unlockedAt: new Date() });

  const [safeItem] = await tx
    .insert(learningItems)
    .values({ languageId: language.id, levelId: level.id, type: "vocabulary", status: "published", position: 1, lessonPriority: 1 })
    .returning();
  await tx.insert(vocabularyItems).values({
    learningItemId: safeItem.id,
    vocabularyGroupId: group.id,
    term: "gato",
    primaryMeaning: "cat",
    partOfSpeech: "noun",
  });

  const [nsfwItem] = await tx
    .insert(learningItems)
    .values({
      languageId: language.id,
      levelId: level.id,
      type: "vocabulary",
      status: "published",
      position: 2,
      lessonPriority: 2,
      contentClassification: "nsfw",
    })
    .returning();
  await tx.insert(vocabularyItems).values({
    learningItemId: nsfwItem.id,
    vocabularyGroupId: group.id,
    term: "palabrota",
    primaryMeaning: "swear word",
    partOfSpeech: "noun",
  });

  return { languageId: language.id, userId: user.id, safeItemId: safeItem.id, nsfwItemId: nsfwItem.id };
}

describe("getEligibleLessonItems NSFW filtering", () => {
  it("excludes an NSFW item by default", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLessonFixture(tx);
      const items = await getEligibleLessonItems(tx, fixture.userId, fixture.languageId);
      const ids = items.map((item) => item.id);

      expect(ids).toContain(fixture.safeItemId);
      expect(ids).not.toContain(fixture.nsfwItemId);
    });
  });

  it("includes the NSFW item when includeNsfw is true", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLessonFixture(tx);
      const items = await getEligibleLessonItems(tx, fixture.userId, fixture.languageId, { includeNsfw: true });
      const ids = items.map((item) => item.id);

      expect(ids).toContain(fixture.safeItemId);
      expect(ids).toContain(fixture.nsfwItemId);
    });
  });

  it("defaults every existing item to safe (no migration silently reclassified anything)", async () => {
    await withTestTransaction(async (tx) => {
      const fixture = await seedLessonFixture(tx);
      const [row] = await tx.select().from(learningItems).where(eq(learningItems.id, fixture.safeItemId));
      expect(row.contentClassification).toBe("safe");
    });
  });
});
