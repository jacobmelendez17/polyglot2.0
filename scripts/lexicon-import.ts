import { config } from "dotenv";

// Runs as a standalone `tsx` CLI, outside Next.js's own env loading — load
// .env.local the same way `db/seed/run.ts` and `drizzle.config.ts` do,
// before anything else touches process.env.
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";
import { recordAuditEvent } from "@/domains/admin/audit-repository";
import { getDefaultLanguageCode } from "@/domains/users";
import { getLanguageByCodeRaw } from "@/domains/lexicon/import/import-cli-support";
import { runDictionaryImport } from "@/domains/lexicon/import/wiktextract-import";
import { getLexicalLanguageProvider } from "@/domains/lexicon/lexical-language-provider";
import {
  LEXICAL_SOURCE_DEFINITIONS,
  getDictionarySourceCodeForLanguage,
} from "@/domains/lexicon/lexical-source-registry";
import { getLexiconSourceConfig } from "@/domains/lexicon/lexicon-source-config";
import { matchAllVocabularyItems } from "@/domains/lexicon/lexicon-mapping-service";
import { flagMappingsNeedingReview } from "@/domains/lexicon/lexicon-repository";
import { refreshRegionalEvidence } from "@/domains/lexicon/regional-evidence";
import type { LexicalImportScope } from "@/domains/lexicon";

/**
 * `npm run lexicon:import` (spec 12 "Controlled Import").
 *
 * A deliberate backend/developer operation, never a request handler: it
 * streams a server-configured file, writes in bounded batches inside one
 * transaction, and prints operational counts. It constructs its own database
 * client rather than importing `db/client.ts`, whose `server-only` guard
 * throws under plain `tsx` — the same workaround `db/seed/run.ts` documents.
 *
 * Usage:
 *   npm run lexicon:import
 *   npm run lexicon:import -- --language es --scope curriculum
 *   npm run lexicon:import -- --scope full_language
 *   npm run lexicon:import -- --scope terms --terms padre,madre
 *   npm run lexicon:import -- --force        # re-ingest an already-imported snapshot
 *   npm run lexicon:import -- --file /path/to/kaikki-es.jsonl.gz
 */

const VALID_SCOPES: LexicalImportScope[] = [
  "curriculum",
  "terms",
  "full_language",
];

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required. Set it in .env.local.");

  const sourceConfig = getLexiconSourceConfig();
  // Defaults to the project's own configured language code ("es-MX"), not a
  // bare "es" — `languages.code` is regional here, and the lexicon resolves
  // the source by base subtag on its own.
  const languageCode = readFlag("language") ?? getDefaultLanguageCode();
  const scopeArg = (readFlag("scope") ?? "curriculum") as LexicalImportScope;
  // Only meaningful after the importer's own parsing or projection changed —
  // the same file then really does produce different rows.
  const force = process.argv.includes("--force");
  if (!VALID_SCOPES.includes(scopeArg)) {
    throw new Error(
      `Unknown --scope "${scopeArg}". Expected one of: ${VALID_SCOPES.join(", ")}.`,
    );
  }
  const filePath = readFlag("file") ?? sourceConfig.wiktextractPath;
  const terms =
    readFlag("terms")
      ?.split(",")
      .map((term) => term.trim())
      .filter(Boolean) ?? [];

  const sourceCode = getDictionarySourceCodeForLanguage(languageCode);
  if (!sourceCode)
    throw new Error(
      `No dictionary source is registered for language "${languageCode}".`,
    );
  const sourceDefinition = LEXICAL_SOURCE_DEFINITIONS[sourceCode];

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });

    const language = await getLanguageByCodeRaw(db, languageCode);
    if (!language)
      throw new Error(
        `Language "${languageCode}" does not exist. Seed it before importing.`,
      );

    console.log(
      `Importing ${sourceCode} (${scopeArg}) for ${languageCode} from ${filePath}`,
    );

    const now = new Date();
    const result = await runDictionaryImport(db, {
      filePath,
      languageId: language.id,
      languageCode,
      sourceDefinition,
      scope: scopeArg,
      terms,
      sourceVersion: sourceConfig.wiktextractVersion,
      extractorVersion: "wiktextract",
      force,
      now,
      onProgress: (counters) => {
        console.log(
          `  scanned=${counters.recordsScanned} retained=${counters.recordsRetained} rejected=${counters.recordsRejected}`,
        );
      },
    });

    if (result.alreadyImported) {
      console.log(
        "This exact snapshot has already been imported. Nothing to do.",
      );
      return;
    }

    console.log(
      `Import complete: scanned=${result.recordsScanned} retained=${result.recordsRetained} ` +
        `rejected=${result.recordsRejected} created=${result.entriesCreated} updated=${result.entriesUpdated} ` +
        `entriesMissing=${result.entriesMarkedMissing} sensesMissing=${result.sensesMarkedMissing} ` +
        `relationsResolved=${result.relationsResolved}`,
    );

    // Derived state, recomputed after the projection commits. Each of these
    // is idempotent, so keeping them outside the import transaction costs
    // nothing but keeps a full-language import's transaction shorter.
    const provider = getLexicalLanguageProvider(languageCode);
    if (provider.regionCodes.length > 0) {
      const evidence = await refreshRegionalEvidence(db, {
        languageId: language.id,
        dictionarySourceId: result.sourceId,
        regionCodes: provider.regionCodes,
        now,
      });
      console.log(`Regional evidence refreshed: ${evidence.evaluated} rows`);
    }

    const matched = await matchAllVocabularyItems(db, language.id);
    console.log(
      `Vocabulary re-matched: processed=${matched.processed} skippedLocked=${matched.skippedLocked} ` +
        Object.entries(matched.byStatus)
          .map(([status, total]) => `${status}=${total}`)
          .join(" "),
    );

    const flagged = await flagMappingsNeedingReview(db);
    if (flagged.flagged > 0)
      console.log(`Mappings flagged for review: ${flagged.flagged}`);

    if (sourceConfig.importActorUserId) {
      await recordAuditEvent(db, {
        actorUserId: sourceConfig.importActorUserId,
        action: "DICTIONARY_IMPORT_COMPLETED",
        resourceType: "lexical_import",
        resourceId: result.importId,
        afterData: {
          sourceCode,
          scope: scopeArg,
          recordsScanned: result.recordsScanned,
          recordsRetained: result.recordsRetained,
          entriesCreated: result.entriesCreated,
          entriesUpdated: result.entriesUpdated,
        },
      });
    } else {
      console.log(
        "No LEXICON_IMPORT_ACTOR_USER_ID configured — skipping the audit event. " +
          "The lexical_imports row is the durable operational record.",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Never print the raw source record or a stack trace: imported content is
  // untrusted, and operator output is one of the easier places for it to
  // escape (spec 12's security rules).
  console.error(
    "Dictionary import failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
