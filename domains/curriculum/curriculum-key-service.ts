import { randomBytes } from "node:crypto";

import { isUniqueViolationOnConstraint } from "@/db/postgres-errors";

/**
 * Curriculum keys (spec 25 §3) — a stable, human-readable external identity
 * that never changes when an item's Level/group/spelling/order changes.
 * Format: `{languageCode}:{segment}:{suffix}`, e.g. `es-MX:vocab:k7p4m2`.
 *
 * This is deliberately a *second* identity alongside `learning_items.id` (the
 * database UUID), never a replacement for it — internal joins/FKs keep using
 * the UUID; the curriculum key exists only so admins and CSV imports can
 * reference "this exact curriculum object" across re-imports and re-exports,
 * per architecture.md's "Permanent Identity" section.
 *
 * Segments deliberately mirror the spec's own examples exactly: `level` and
 * `group` for the two curriculum-structure tables, `vocab`/`grammar` for the
 * two `learning_items.type` values (not `vocabulary`, matching
 * `es-MX:vocab:k7p4m2` in the spec rather than inventing a longer segment).
 */
export type CurriculumKeySegment = "level" | "group" | "vocab" | "grammar";

/** `learning_items.type` -> the key segment spec 25 documents for it. */
export const CURRICULUM_KEY_SEGMENT_BY_ITEM_TYPE: Record<
  "vocabulary" | "grammar",
  CurriculumKeySegment
> = {
  vocabulary: "vocab",
  grammar: "grammar",
};

const SUFFIX_LENGTH = 6;
// Lowercase alphanumeric only (spec 25 §3.1: "safe for CSV usage") — no
// separators, quotes, or characters a spreadsheet/CSV parser could mangle.
const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateSuffix(): string {
  const bytes = randomBytes(SUFFIX_LENGTH);
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_ALPHABET[bytes[i]! % SUFFIX_ALPHABET.length];
  }
  return suffix;
}

/**
 * Builds one candidate curriculum key. Not guaranteed unique on its own —
 * callers writing to the database must go through `withGeneratedCurriculumKey`
 * below, which handles the (astronomically unlikely, but real) case of a
 * collision against the table's unique constraint.
 */
export function generateCurriculumKey(
  languageCode: string,
  segment: CurriculumKeySegment,
): string {
  return `${languageCode}:${segment}:${generateSuffix()}`;
}

const MAX_GENERATION_ATTEMPTS = 5;

/**
 * Generates a curriculum key and passes it to `insertRow`, retrying with a
 * freshly generated key if — and only if — the insert fails on the target
 * table's own `curriculum_key` unique constraint (identified by
 * `uniqueConstraintName`, e.g. `"levels_curriculum_key_key"`).
 *
 * This is a real "attempt the insert, react to the database's own decision"
 * pattern rather than a "check whether the key exists, then insert" race
 * (code-standards.md's explicit rule against that shape) — with a suffix
 * space of 36^6 (~2.2 billion), a genuine collision is exceedingly rare, but
 * the codebase's own precedent (`domains/users/user-repository.ts`'s username
 * uniqueness) is to handle it for real rather than assume it away.
 *
 * A conflict on a *different* unique constraint on the same insert (e.g. a
 * level-number or position collision) is not a curriculum-key problem and is
 * rethrown immediately rather than retried.
 */
export async function withGeneratedCurriculumKey<T>(
  languageCode: string,
  segment: CurriculumKeySegment,
  uniqueConstraintName: string,
  insertRow: (curriculumKey: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const curriculumKey = generateCurriculumKey(languageCode, segment);
    try {
      return await insertRow(curriculumKey);
    } catch (error) {
      if (!isUniqueViolationOnConstraint(error, uniqueConstraintName)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw new Error(
    `Could not generate a unique curriculum key after ${MAX_GENERATION_ATTEMPTS} attempts (constraint: ${uniqueConstraintName})`,
    { cause: lastError },
  );
}
