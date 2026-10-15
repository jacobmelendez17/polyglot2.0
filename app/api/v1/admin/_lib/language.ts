import { getLanguages } from "@/domains/curriculum/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * Admin endpoints read and write one language at a time. An id that names no
 * language is a 404 — never an empty success, which would hide what is really
 * a malformed or stale request — and is checked before anything is read or
 * written under it. `requireLanguage` is the same check for a caller that also
 * needs the language itself (its code picks the dictionary provider).
 */
export async function requireLanguage(languageId: string) {
  const languages = await getLanguages();
  const language = languages.find((candidate) => candidate.id === languageId);
  if (!language) {
    throw new AppError("ITEM_NOT_FOUND", "That language could not be found.");
  }
  return language;
}

export async function assertLanguageExists(languageId: string): Promise<void> {
  await requireLanguage(languageId);
}
