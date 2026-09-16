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

const REVIEW_ANSWERS: Record<string, { toEnglish: string; toSpanish: string }> = {};
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

  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await answerInput.isVisible().catch(() => false))) return; // session complete

    const text = await page.locator("body").innerText();
    const promptLine = text.split("\n").map((line) => line.trim()).find((line, index, lines) => index > 0 && lines[index - 1] === "" && line.length > 0 && !line.includes("Exit"));
    const term = (promptLine ?? "").toLowerCase();
    const direction: "toEnglish" | "toSpanish" = text.includes("Spanish → English") ? "toEnglish" : "toSpanish";
    const answer = REVIEW_ANSWERS[term]?.[direction];
    if (!answer) throw new Error(`No known review answer for prompt "${term}" (${direction}). Body: ${text.slice(0, 300)}`);

    await answerInput.fill(answer);
    await page.getByRole("button", { name: "Submit" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  throw new Error("Review session did not finish within the expected number of attempts.");
}
