import { type Page } from "@playwright/test";

/**
 * Unlike the lesson quiz (which keeps the Spanish term as the heading and
 * only swaps a direction label), a review's prompt itself flips to the
 * *source* language of the direction being tested: "Spanish -> English"
 * shows the Spanish term and expects the English answer, while
 * "English -> Spanish" shows the English meaning and expects the Spanish
 * answer (with its article). Both the term and the meaning must resolve to
 * an answer, since either can be the visible prompt.
 */
const REVIEW_TERMS = [
  { term: "gato", meaning: "cat", toEnglish: "cat", toSpanish: "el gato" },
  { term: "casa", meaning: "house", toEnglish: "house", toSpanish: "la casa" },
  { term: "agua", meaning: "water", toEnglish: "water", toSpanish: "el agua" },
  { term: "rojo", meaning: "red", toEnglish: "red", toSpanish: "rojo" },
  { term: "azul", meaning: "blue", toEnglish: "blue", toSpanish: "azul" },
  { term: "verde", meaning: "green", toEnglish: "green", toSpanish: "verde" },
] as const;

const REVIEW_ANSWERS: Record<string, { toEnglish: string; toSpanish: string }> =
  {};
for (const { term, meaning, toEnglish, toSpanish } of REVIEW_TERMS) {
  REVIEW_ANSWERS[term] = { toEnglish, toSpanish };
  REVIEW_ANSWERS[meaning] = { toEnglish, toSpanish };
}

/**
 * Answers every due review question correctly until the session is
 * complete ("Session complete!"). Spec 22's Review -> Progress flow uses a
 * correct answer path for the principal journey — penalty mathematics are
 * covered at lower test tiers, not here.
 */
export async function completeAllDueReviews(page: Page): Promise<void> {
  const answerInput = page.getByLabel("Your answer");
  const completeHeading = page.getByRole("heading", {
    name: "Session complete!",
  });

  for (let attempt = 0; attempt < 20; attempt++) {
    // `isVisible()` is an instant, non-waiting check — right after the
    // previous iteration's "Continue" click, neither the next question nor
    // the completion screen has necessarily mounted yet, so it can read as
    // "session complete" mid-transition and return early (the calling spec
    // then sees neither a due review nor "Session complete!"). Wait for
    // whichever of the two real end states actually appears instead.
    const state = await Promise.race([
      answerInput
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "question" as const),
      completeHeading
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "complete" as const),
    ]);
    if (state === "complete") return;

    const text = await page.locator("body").innerText();
    // Positively identify the prompt line by checking it against the known
    // set of terms/meanings, rather than trying to exclude every other
    // piece of UI chrome on this screen (session stats, "N left", etc.) —
    // more robust than an exclusion list, and than a positional index,
    // since this screen's exact line layout isn't fixed the way the lesson
    // quiz's is.
    const lines = text.split("\n").map((line) => line.trim().toLowerCase());
    const term = lines.find((line) => line in REVIEW_ANSWERS);
    const direction: "toEnglish" | "toSpanish" = text.includes(
      "Spanish → English",
    )
      ? "toEnglish"
      : "toSpanish";
    const answer = term ? REVIEW_ANSWERS[term]?.[direction] : undefined;
    if (!term || !answer)
      throw new Error(
        `No known review prompt found (${direction}). Body: ${text.slice(0, 300)}`,
      );

    await answerInput.fill(answer);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  throw new Error(
    "Review session did not finish within the expected number of attempts.",
  );
}
