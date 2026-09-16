import { expect, type Page } from "@playwright/test";

/**
 * Answers for the seeded E2E fixture curriculum's own vocabulary/grammar
 * (`db/seed/e2e-fixtures.ts`), keyed by term/structure and direction. Real
 * Spanish, including the article the quiz requires on the English->Spanish
 * direction for nouns (ui-context.md/progress-tracker.md: the quiz enforces
 * the article on that direction).
 */
const LESSON_ANSWERS: Record<string, { toEnglish: string; toSpanish: string }> = {
  y: { toEnglish: "and", toSpanish: "y" },
  pero: { toEnglish: "but", toSpanish: "pero" },
  gato: { toEnglish: "cat", toSpanish: "el gato" },
  casa: { toEnglish: "house", toSpanish: "la casa" },
  agua: { toEnglish: "water", toSpanish: "el agua" },
  rojo: { toEnglish: "red", toSpanish: "rojo" },
  azul: { toEnglish: "blue", toSpanish: "azul" },
  verde: { toEnglish: "green", toSpanish: "verde" },
};

function wrongAnswerFor(term: string): string {
  return `not-${term}`;
}

/**
 * Clicks through every lesson item once (the study phase), then returns
 * once the "Start Quiz" control is available — spec 22's "study content
 * renders" and "the lesson quiz action appears only after every lesson item
 * has been opened" (ui-context.md).
 */
export async function studyAllLessonItems(page: Page): Promise<void> {
  const nextButton = page.getByRole("button", { name: "Next", exact: true });
  const startQuizButton = page.getByRole("button", { name: "Start Quiz" });

  // Bounded retry around the whole study pass: this local dev server's
  // long-lived Neon WebSocket pool (db/client.ts's single module-scoped
  // Pool, reused for the life of the process) has occasionally stalled a
  // single Server Action call for the full test timeout in this session —
  // genuine environmental flakiness (code-standards.md's Determinism and
  // Flake Policy explicitly allows E2E retries for exactly this, unlike
  // domain tests), not a reproducible product defect: a reload always
  // clears it. Lessons are intentionally ephemeral (architecture.md), so
  // reloading and re-studying is always safe.
  for (let attempt = 0; attempt < 3; attempt++) {
    while (!(await startQuizButton.isVisible().catch(() => false))) {
      await nextButton.click();
    }
    try {
      await startQuizButton.click({ timeout: 30_000 });
      return;
    } catch {
      await page.reload();
    }
  }

  // Final attempt without a shortened timeout, so a real failure still
  // reports Playwright's own actionable error rather than this helper's.
  while (!(await startQuizButton.isVisible().catch(() => false))) {
    await nextButton.click();
  }
  await startQuizButton.click();
}

export interface CompleteLessonQuizOptions {
  /**
   * Deliberately answers this term's next occurrence incorrectly once, to
   * exercise the "incorrect answer returns later in the quiz" rule (spec
   * 22's Lesson -> SRS flow). The retry is then answered correctly when it
   * reappears.
   */
  missTermOnce?: string;
}

/**
 * Answers every required question in the current lesson quiz correctly
 * (optionally missing one deliberately first), until the comprehension quiz
 * is complete. Assumes `studyAllLessonItems` has already run and "Start
 * Quiz" has been clicked.
 */
export async function completeLessonQuiz(page: Page, options: CompleteLessonQuizOptions = {}): Promise<void> {
  const answerInput = page.getByLabel("Your answer");
  let hasMissed = !options.missTermOnce;

  // Bounded rather than infinite: at most a handful of retries beyond the
  // fixture's 10 required questions is enough headroom for the one
  // deliberate miss without masking a genuine hang as a slow pass.
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!(await answerInput.isVisible().catch(() => false))) return; // quiz finished

    const heading = await page.locator("body").innerText();
    const lines = heading.split("\n").map((line) => line.trim()).filter(Boolean);
    const term = lines[1] ?? lines[0]!;
    const direction: "toEnglish" | "toSpanish" = heading.includes("Spanish → English") ? "toEnglish" : "toSpanish";
    const correctAnswer = LESSON_ANSWERS[term]?.[direction];
    if (!correctAnswer) throw new Error(`No known answer for term "${term}" (${direction}).`);

    const shouldMiss = !hasMissed && term === options.missTermOnce;
    const answer = shouldMiss ? wrongAnswerFor(term) : correctAnswer;
    if (shouldMiss) hasMissed = true;

    await answerInput.fill(answer);
    await page.keyboard.press("Enter");
    await expect(page.getByText(shouldMiss ? /Incorrect/i : /Correct!/i)).toBeVisible();

    await page.keyboard.press("Enter");
    // A cleared, editable input is the reliable "ready for the next
    // question" signal — the `readonly` attribute used for feedback
    // display can briefly linger through a transition.
    await expect(answerInput).toHaveValue("", { timeout: 8_000 }).catch(() => {
      // The quiz may have finished instead of advancing to another question.
    });
  }

  throw new Error("Lesson quiz did not finish within the expected number of attempts.");
}
