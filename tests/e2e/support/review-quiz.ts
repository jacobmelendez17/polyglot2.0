import { type Page } from "@playwright/test";

const REVIEW_ANSWERS: Record<string, { toEnglish: string; toSpanish: string }> = {
  gato: { toEnglish: "cat", toSpanish: "el gato" },
  casa: { toEnglish: "house", toSpanish: "la casa" },
  agua: { toEnglish: "water", toSpanish: "el agua" },
  rojo: { toEnglish: "red", toSpanish: "rojo" },
  azul: { toEnglish: "blue", toSpanish: "azul" },
  verde: { toEnglish: "green", toSpanish: "verde" },
};

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
