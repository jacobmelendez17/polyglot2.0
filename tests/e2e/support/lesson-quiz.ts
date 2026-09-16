import { expect, type Page } from "@playwright/test";

/**
 * Answers for the seeded E2E fixture curriculum's own vocabulary/grammar
 * (`db/seed/e2e-fixtures.ts`), keyed by *both* the term and its English
 * meaning — same reasoning as `review-quiz.ts`'s lookup: the quiz's prompt
 * flips to the source language of the direction under test.
 * "Spanish → English" shows the Spanish term (answer in English);
 * "English → Spanish" shows the **English meaning** (answer in Spanish,
 * with its article for nouns).
 */
const LESSON_TERMS = [
  { term: "y", meaning: "and", toEnglish: "and", toSpanish: "y" },
  { term: "pero", meaning: "but", toEnglish: "but", toSpanish: "pero" },
  { term: "gato", meaning: "cat", toEnglish: "cat", toSpanish: "el gato" },
  { term: "casa", meaning: "house", toEnglish: "house", toSpanish: "la casa" },
  { term: "agua", meaning: "water", toEnglish: "water", toSpanish: "el agua" },
  { term: "rojo", meaning: "red", toEnglish: "red", toSpanish: "rojo" },
  { term: "azul", meaning: "blue", toEnglish: "blue", toSpanish: "azul" },
  { term: "verde", meaning: "green", toEnglish: "green", toSpanish: "verde" },
] as const;

const LESSON_ANSWERS: Record<string, { toEnglish: string; toSpanish: string }> = {};
for (const { term, meaning, toEnglish, toSpanish } of LESSON_TERMS) {
  LESSON_ANSWERS[term] = { toEnglish, toSpanish };
  LESSON_ANSWERS[meaning] = { toEnglish, toSpanish };
}

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

  while (!(await startQuizButton.isVisible().catch(() => false))) {
    await nextButton.click();
  }

  // `force: true`, not a plain `.click()`: diagnosed directly against this
  // server (a temporary instrumented Server Action plus browser-console
  // capture) — the Server Action itself consistently resolves in well
  // under a second, but Playwright's default actionability click sometimes
  // reports "element is not enabled" and retries for its *entire* timeout
  // even after the click has already landed and the button's `isPending`
  // (React `useTransition`) has genuinely flipped back to false server-side.
  // A forced click (which skips the enabled/stable pre-checks, not the
  // click itself) reproduced cleanly and quickly across every repeat run,
  // where the identical non-forced click intermittently did not. See
  // progress-tracker.md's spec 22 entry for the full diagnostic trail.
  await startQuizButton.click({ force: true });

  // The real completion signal: the quiz's answer field actually mounted,
  // not just that the click was dispatched.
  await page.getByLabel("Your answer").waitFor({ state: "visible", timeout: 30_000 });
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
    await expect(page.getByText(shouldMiss ? /Not quite/i : /Correct!/i)).toBeVisible();

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
