import { and, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { userItemProgress } from "@/db/schema";

import {
  ensureLearnerOnboarded,
  getFixtureIds,
  getLearnerId,
  makeVocabularyItemDue,
  resetLearnerItemProgress,
} from "../support/e2e-state";
import { withE2EDb } from "../support/e2e-db";
import { completeAllDueReviews } from "../support/review-quiz";

/**
 * Spec 22's "Critical Flow — Review -> Progress". Due-ness is staged
 * directly in the database (spec 22 explicitly forbids waiting for real SRS
 * time to pass), then the review is completed through the real UI.
 */
test.describe("Review -> Progress", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
    await resetLearnerItemProgress();
  });

  test("dashboard shows a due review, completing it persists progress, and it stops appearing as due", async ({
    page,
  }) => {
    await makeVocabularyItemDue("gato", "beginner_2");
    const fixture = await getFixtureIds();
    const learnerId = await getLearnerId();
    const gatoId = fixture.vocabularyItemIdByTerm.gato!;

    await page.goto("/dashboard");
    await expect(page.getByText(/review/i).first()).toBeVisible();

    await page.goto("/reviews");
    await completeAllDueReviews(page);

    await expect(
      page.getByRole("heading", { name: "Session complete!" }),
    ).toBeVisible();

    const [progress] = await withE2EDb((db) =>
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
    expect(progress).toBeDefined();
    expect(progress!.reviewCount).toBeGreaterThan(0);
    // A freshly-answered-correctly review is scheduled back out, not due again.
    expect(
      progress!.nextReviewAt && progress!.nextReviewAt.getTime() > Date.now(),
    ).toBe(true);

    await page.goto("/reviews");
    await expect(page.getByLabel("Your answer")).toHaveCount(0);
  });
});
