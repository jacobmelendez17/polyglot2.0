import { expect, test } from "@playwright/test";

import {
  ensureLearnerOnboarded,
  getFixtureIds,
  getLearnerId,
  resetLearnerItemProgress,
} from "../support/e2e-state";
import {
  completeLessonQuiz,
  studyAllLessonItems,
} from "../support/lesson-quiz";
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

  // A full lesson (study 6 items, then a 10-question quiz) is the heaviest
  // interaction in the suite. Kept above the 90s suite default as headroom
  // for it specifically — see lesson-quiz.ts's `studyAllLessonItems` for
  // the diagnosed root cause of the intermittent stalls this test used to
  // hit (a Playwright actionability quirk on the "Start Quiz" click, not a
  // server or domain defect) and why a forced click resolved it.
  test.setTimeout(60_000);

  test("completing the lesson quiz enrolls items in SRS only after completion, including a deliberately missed question", async ({
    page,
  }) => {
    await page.goto("/lessons");
    await expect(page.locator("body")).toContainText("Level 1");

    await studyAllLessonItems(page);

    const fixture = await getFixtureIds();
    const learnerId = await getLearnerId();
    const gatoId = fixture.vocabularyItemIdByTerm.gato!;

    // Comprehension quiz not yet completed: no SRS enrollment exists yet.
    const beforeCompletion = await withE2EDb((db) =>
      db
        .select()
        .from(userItemProgress)
        .where(
          and(
            eq(userItemProgress.userId, learnerId),
            eq(userItemProgress.learningItemId, gatoId),
          ),
        ),
    );
    expect(beforeCompletion).toHaveLength(0);

    await completeLessonQuiz(page, { missTermOnce: "gato" });

    await expect(
      page.getByRole("heading", { name: "Lesson Complete!" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Return to Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const afterCompletion = await withE2EDb((db) =>
      db
        .select()
        .from(userItemProgress)
        .where(
          and(
            eq(userItemProgress.userId, learnerId),
            eq(userItemProgress.learningItemId, gatoId),
          ),
        ),
    );
    expect(afterCompletion).toHaveLength(1);
    expect(afterCompletion[0]!.srsStage).not.toBeNull();
  });

  test("exiting an unfinished lesson does not enroll any items in SRS", async ({
    page,
  }) => {
    await page.goto("/lessons");
    await studyAllLessonItems(page);
    // Quiz is available but never completed — refresh discards the ephemeral session.
    await page.reload();

    await page.goto("/lessons");

    const fixture = await getFixtureIds();
    const learnerId = await getLearnerId();
    const gatoId = fixture.vocabularyItemIdByTerm.gato!;

    const progress = await withE2EDb((db) =>
      db
        .select()
        .from(userItemProgress)
        .where(
          and(
            eq(userItemProgress.userId, learnerId),
            eq(userItemProgress.learningItemId, gatoId),
          ),
        ),
    );
    expect(progress).toHaveLength(0);

    // The lesson restarts from the beginning rather than resuming.
    await expect(page.locator("body")).toContainText("1 / 6");
  });
});
