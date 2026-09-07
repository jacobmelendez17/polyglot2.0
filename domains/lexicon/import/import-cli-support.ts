import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { languages } from "@/db/schema";

/**
 * The one thing the import CLI needs from outside the Lexicon domain: the
 * internal id of the language it is importing for.
 *
 * `domains/curriculum`'s own `getLanguageByCode` would be the natural call,
 * but it lives behind `curriculum/server.ts`, which value-imports
 * `db/client.ts` — and that module's `server-only` guard throws
 * unconditionally under plain `tsx`, which is how the import script runs
 * (see progress-tracker.md's Architecture Decisions). This takes an injected
 * `DbClient` instead, exactly like every other repository function here.
 */
export async function getLanguageByCodeRaw(db: DbClient, code: string): Promise<{ id: string; code: string } | null> {
  const [row] = await db.select({ id: languages.id, code: languages.code }).from(languages).where(eq(languages.code, code)).limit(1);
  return row ?? null;
}
