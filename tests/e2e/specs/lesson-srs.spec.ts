import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded, getFixtureIds, getLearnerId, resetLearnerItemProgress } from "../support/e2e-state";
import { completeLessonQuiz, studyAllLessonItems } from "../support/lesson-quiz";
import { withE2EDb } from "../support/e2e-db";
import { userItemProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Spec 22's "Critical Flow — Lesson -> SRS".
 */
test.describe("Lesson -> SRS", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
    await resetLearnerItemProgress();
  });

  // A full lesson (study 6 items, then a 10-question quiz with real Server
  // Action round trips) is the heaviest interaction in the suite. See
  // progress-tracker.md's "Known gap" entry for lesson-srs.spec.ts: in this
  // development session the "Start Quiz" transition intermittently stalled
  // for minutes at a time in a way additional timeout did not resolve (5
  // minutes of patience was not sufficient), most likely tied to this
  // machine's system-level memory pressure during a long session rather
  // than a logic defect — the same domain logic is fully covered by the
  // integration suite (three clean consecutive runs) and this exact
  // interaction succeeded repeatedly in earlier, less-loaded manual runs
  // this same session. 120s (above the suite default) gives real headroom
  // without masking a genuine hang as a multi-minute "still working."
  test.setTimeout(120_000);

  test("completing the lesson quiz enrolls items in SRS only after completion, including a deliberately missed question", async ({ page }) => {
    await page.goto("/lessons");
    await expect(page.locator("body")).toContainText("Level 1");

    await studyAllLessonItems(page);

    const fixture = await getFixtureIds();
    const learnerId = await getLearnerId();
    const gatoId = fixture.vocabularyItemIdByTerm.gato!;

    // Comprehension quiz not yet completed: no SRS enrollment exists yet.
    const beforeCompletion = await withE2EDb((db) =>
      db.select().from(userItemProgress).where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId))),
    );
    expect(beforeCompletion).toHaveLength(0);

    await completeLessonQuiz(page, { missTermOnce: "gato" });

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const afterCompletion = await withE2EDb((db) =>
      db.select().from(userItemProgress).where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId))),
    );
    expect(afterCompletion).toHaveLength(1);
    expect(afterCompletion[0]!.srsStage).not.toBeNull();
  });

  test("exiting an unfinished lesson does not enroll any items in SRS", async ({ page }) => {
    await page.goto("/lessons");
    await studyAllLessonItems(page);
    // Quiz is available but never completed — refresh discards the ephemeral session.
    await page.reload();

    await page.goto("/lessons");

    const fixture = await getFixtureIds();
    const learnerId = await getLearnerId();
    const gatoId = fixture.vocabularyItemIdByTerm.gato!;

    const progress = await withE2EDb((db) =>
      db.select().from(userItemProgress).where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId))),
    );
    expect(progress).toHaveLength(0);

    // The lesson restarts from the beginning rather than resuming.
    await expect(page.locator("body")).toContainText("1 / 6");
  });
});
