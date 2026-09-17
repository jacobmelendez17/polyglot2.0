import { config } from "dotenv";

config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";
import { recordAuditEvent } from "@/domains/admin/audit-repository";
import { getDefaultLanguageCode } from "@/domains/users";
import { getLanguageByCodeRaw } from "@/domains/lexicon/import/import-cli-support";
import { runRegionalImport } from "@/domains/lexicon/import/rla-import";
import { getLexicalLanguageProvider } from "@/domains/lexicon/lexical-language-provider";
import {
  LEXICAL_SOURCE_DEFINITIONS,
  getDictionarySourceCodeForLanguage,
  getRegionalSourceCodeForRegion,
} from "@/domains/lexicon/lexical-source-registry";
import { getLexicalSourceByCode } from "@/domains/lexicon/lexicon-repository";
import { getLexiconSourceConfig } from "@/domains/lexicon/lexicon-source-config";
import { refreshRegionalEvidence } from "@/domains/lexicon/regional-evidence";

/**
 * `npm run lexicon:import-rla` (spec 12 "RLA Import").
 *
 * Ingests the configured Hunspell word lists for each of the language's
 * regions, then recomputes the cached regional evidence those lists feed.
 * Same constraints as the dictionary import: server-configured paths only,
 * checksum-idempotent, one transaction per region, nothing outside the
 * `lexicon` tables written.
 *
 * Usage:
 *   npm run lexicon:import-rla
 *   npm run lexicon:import-rla -- --language es
 *   npm run lexicon:import-rla -- --dir /path/to/rla-es/dist
 */

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * RLA-ES names its files by locale with an underscore (`es_MX.dic`), while
 * Polyglot stores region codes in BCP-47 form (`es-MX`). One deliberate,
 * documented translation, kept at the edge rather than leaking either
 * convention into the other.
 */
function fileStemForRegion(regionCode: string): string {
  return regionCode.replace("-", "_");
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
  const directory = readFlag("dir") ?? sourceConfig.rlaDirectory;
  const provider = getLexicalLanguageProvider(languageCode);

  if (provider.regionCodes.length === 0) {
    throw new Error(
      `Language "${languageCode}" has no configured regions, so there is no regional data to import.`,
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    const language = await getLanguageByCodeRaw(db, languageCode);
    if (!language)
      throw new Error(
        `Language "${languageCode}" does not exist. Seed it before importing.`,
      );

    const now = new Date();

    for (const regionCode of provider.regionCodes) {
      const sourceCode = getRegionalSourceCodeForRegion(regionCode);
      if (!sourceCode) {
        console.log(
          `No regional source registered for ${regionCode} — skipping.`,
        );
        continue;
      }

      const result = await runRegionalImport(db, {
        directory,
        fileStem: fileStemForRegion(regionCode),
        regionCode,
        sourceDefinition: LEXICAL_SOURCE_DEFINITIONS[sourceCode],
        sourceVersion: sourceConfig.rlaVersion,
        now,
      });

      if (result.alreadyImported) {
        console.log(
          `${regionCode}: this exact word list has already been imported. Nothing to do.`,
        );
        continue;
      }

      console.log(
        `${regionCode}: scanned=${result.recordsScanned} retained=${result.recordsRetained} encoding=${result.encoding}`,
      );

      if (sourceConfig.importActorUserId) {
        await recordAuditEvent(db, {
          actorUserId: sourceConfig.importActorUserId,
          action: "DICTIONARY_IMPORT_COMPLETED",
          resourceType: "lexical_import",
          resourceId: result.importId,
          afterData: {
            sourceCode,
            regionCode,
            recordsRetained: result.recordsRetained,
          },
        });
      }
    }

    // A new word list changes the answer for entries that already existed,
    // so evidence is always recomputed — not only for entries imported today.
    const dictionarySourceCode =
      getDictionarySourceCodeForLanguage(languageCode);
    const dictionarySource = dictionarySourceCode
      ? await getLexicalSourceByCode(db, dictionarySourceCode)
      : null;
    if (dictionarySource) {
      const evidence = await refreshRegionalEvidence(db, {
        languageId: language.id,
        dictionarySourceId: dictionarySource.id,
        regionCodes: provider.regionCodes,
        now,
      });
      console.log(`Regional evidence refreshed: ${evidence.evaluated} rows`);
    } else {
      console.log(
        "No dictionary entries imported yet — regional evidence will be computed on the next dictionary import.",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Regional import failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
