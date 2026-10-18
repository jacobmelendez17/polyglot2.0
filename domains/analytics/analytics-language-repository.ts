import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { languages } from "@/db/schema";

/**
 * A language's code never changes once it exists, so what is found is kept for
 * the life of the process: emitting an event should not cost a query per event.
 * Only hits are cached — a missing language is looked up again.
 */
const codeById = new Map<string, string>();

/** The language's code (`es-MX`), or `null` when there is no such language. */
export async function findLanguageCode(
  db: DbClient,
  languageId: string,
): Promise<string | null> {
  const cached = codeById.get(languageId);
  if (cached) return cached;

  const [row] = await db
    .select({ code: languages.code })
    .from(languages)
    .where(eq(languages.id, languageId))
    .limit(1);
  if (!row) return null;

  codeById.set(languageId, row.code);
  return row.code;
}
