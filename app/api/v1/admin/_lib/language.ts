import { getLanguages } from "@/domains/curriculum/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * Admin endpoints read and write one language at a time. An id that names no
 * language is a 404 — never an empty success, which would hide what is really
 * a malformed or stale request — and is checked before anything is read or
 * written under it.
 */
export async function assertLanguageExists(languageId: string): Promise<void> {
  const languages = await getLanguages();
  if (!languages.some((language) => language.id === languageId)) {
    throw new AppError("ITEM_NOT_FOUND", "That language could not be found.");
  }
}
