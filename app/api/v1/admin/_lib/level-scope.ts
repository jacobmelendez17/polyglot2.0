import { getLevelById } from "@/domains/curriculum/server";
import { AppError } from "@/lib/errors/app-error";

/**
 * A level named in a request must exist **in the language the same request
 * names** (spec 26 §3 "Cross-language isolation": referenced relationships are
 * validated on the server, not assumed). Without this, the read model would
 * answer "no groups" for a mismatched pair — hiding what is really a malformed
 * request — and a write would reach the database and fail on its composite
 * foreign key as a bare 500.
 *
 * A level that does not exist and a level in another language get the same
 * answer on purpose: the caller learns nothing about levels they did not name
 * correctly.
 */
export async function assertLevelInLanguage(
  levelId: string,
  languageId: string,
): Promise<void> {
  const level = await getLevelById(levelId);
  if (!level || level.languageId !== languageId) {
    throw new AppError(
      "CURRICULUM_VALIDATION_FAILED",
      "That level doesn't belong to the selected language.",
    );
  }
}
