/**
 * Server-side source locations (spec 12 "Security": dictionary source
 * locations must be configured server-side; the Admin UI may never supply an
 * arbitrary remote fetch URL).
 *
 * Reads `process.env` directly rather than `lib/env.ts`, matching
 * `drizzle.config.ts`'s precedent: these are only consumed by the import
 * CLI, which runs as plain `tsx` outside Next.js and would otherwise have to
 * satisfy `lib/env.ts`'s Clerk and lesson-secret requirements to read a file
 * path. They are optional by design — an application that has never imported
 * a dictionary must still boot.
 *
 * Defaults point at the small committed fixture set under `/data-sources`,
 * so `npm run lexicon:import` does something real and reproducible on a
 * fresh clone. Point the variables at a full Kaikki extract and an RLA-ES
 * checkout to ingest the real language.
 */

export const DEFAULT_WIKTEXTRACT_PATH = "data-sources/wiktextract/es-sample.jsonl";
export const DEFAULT_RLA_DIR = "data-sources/rla-es";

export interface LexiconSourceConfig {
  /** Path to a Wiktextract/Kaikki JSONL file. `.gz` is streamed and decompressed in place. */
  wiktextractPath: string;
  /** Directory holding the RLA-ES Hunspell resources (`<region>.dic` / `<region>.aff`). */
  rlaDirectory: string;
  /** Optional upstream release identifier recorded on the import row. */
  wiktextractVersion: string | null;
  rlaVersion: string | null;
  /**
   * Internal Polyglot user id to attribute import audit events to. Optional:
   * a CLI import has no signed-in actor, and inventing a synthetic user row
   * to satisfy the audit foreign key would put a fictional actor in the
   * permanent audit trail. When unset, `lexical_imports` remains the
   * durable operational record and no audit event is written.
   */
  importActorUserId: string | null;
}

export function getLexiconSourceConfig(): LexiconSourceConfig {
  return {
    wiktextractPath: process.env.LEXICON_WIKTEXTRACT_PATH?.trim() || DEFAULT_WIKTEXTRACT_PATH,
    rlaDirectory: process.env.LEXICON_RLA_DIR?.trim() || DEFAULT_RLA_DIR,
    wiktextractVersion: process.env.LEXICON_WIKTEXTRACT_VERSION?.trim() || null,
    rlaVersion: process.env.LEXICON_RLA_VERSION?.trim() || null,
    importActorUserId: process.env.LEXICON_IMPORT_ACTOR_USER_ID?.trim() || null,
  };
}
