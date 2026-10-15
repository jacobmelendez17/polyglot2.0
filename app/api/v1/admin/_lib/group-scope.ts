import { getVocabularyGroupsByLanguage } from "@/domains/curriculum/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * A vocabulary group named in a request must exist **in the language the same
 * request names** (spec 26 §3 "Cross-language isolation") — the sibling of
 * `assertLevelInLanguage`. Without it a mismatched pair would be answered "no
 * words" instead of "that is not a request we understand".
 *
 * A group that does not exist and a group in another language get the same
 * answer on purpose: the caller learns nothing about groups they did not name
 * correctly.
 */
export async function assertGroupInLanguage(
  groupId: string,
  languageId: string,
): Promise<void> {
  const groups = await getVocabularyGroupsByLanguage(languageId);
  if (!groups.some((group) => group.id === groupId)) {
    throw new AppError(
      "CURRICULUM_VALIDATION_FAILED",
      "That group doesn't belong to the selected language.",
    );
  }
}
