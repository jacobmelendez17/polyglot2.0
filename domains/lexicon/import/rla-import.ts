import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DbClient } from "@/db/client";

import type { LexicalSourceDefinition } from "../lexical-source-registry";

import { parseHunspellDictionary, parseHunspellEncoding, toBufferEncoding } from "./hunspell-adapter";
import {
  buildImportScopeKey,
  createLexicalImport,
  findCompletedImport,
  persistRegionalLexemeBatch,
  updateLexicalImport,
  upsertLexicalSource,
} from "./lexicon-import-repository";
import { hashBytes } from "./source-hash";

/**
 * Spec 12 "RLA Import": processes the configured RLA/Hunspell resources into
 * local relational data. Same guarantees as the dictionary import — checksum
 * idempotency, one transaction, non-destructive — with the same hard
 * boundary: nothing outside `lexicon` tables is written.
 *
 * Hunspell specifics stay in `hunspell-adapter.ts`; this file only decides
 * which files to read and how to persist what comes back. Regional word
 * lists are evidence, never definitions — nothing here creates a dictionary
 * entry, a sense, or a curriculum item.
 */

const LEXEME_BATCH_SIZE = 1_000;

/** A `.dic` is a plain word list; even a large Spanish one is a few megabytes. Guarded anyway, since it is untrusted input. */
const MAX_DIC_BYTES = 256 * 1024 * 1024;

export interface RunRegionalImportInput {
  /** Directory holding `<regionFileStem>.dic` / `.aff`. */
  directory: string;
  /** Base filename without extension, e.g. "es_MX". */
  fileStem: string;
  regionCode: string;
  sourceDefinition: LexicalSourceDefinition;
  sourceVersion?: string | null;
  now: Date;
}

export interface RegionalImportResult {
  importId: string;
  sourceId: string;
  alreadyImported: boolean;
  regionCode: string;
  recordsScanned: number;
  recordsRetained: number;
  /** Declared by the `.aff` file and used to decode the `.dic`, so accented forms survive verbatim. */
  encoding: string;
}

export async function runRegionalImport(
  db: DbClient,
  input: RunRegionalImportInput,
): Promise<RegionalImportResult> {
  const affPath = join(input.directory, `${input.fileStem}.aff`);
  const dicPath = join(input.directory, `${input.fileStem}.dic`);

  // `.aff` is read first and only for its encoding declaration: decoding a
  // Latin-1 Spanish word list as UTF-8 mangles exactly the accented
  // characters the whole normalization rule exists to preserve, and it would
  // fail silently as a matching problem much later.
  const affBuffer = readFileSync(affPath);
  const hunspellEncoding = parseHunspellEncoding(affBuffer.toString("latin1"));
  const bufferEncoding = toBufferEncoding(hunspellEncoding);

  const dicBuffer = readFileSync(dicPath);
  if (dicBuffer.byteLength > MAX_DIC_BYTES) {
    throw new Error(`Regional word list exceeds the maximum permitted size (${dicBuffer.byteLength} bytes).`);
  }

  const sourceId = await upsertLexicalSource(db, input.sourceDefinition);
  const fileChecksum = hashBytes(dicBuffer);

  const scopeKey = buildImportScopeKey("full_language");
  const alreadyCompleted = await findCompletedImport(db, { sourceId, fileChecksum, scopeKey });
  if (alreadyCompleted) {
    return {
      importId: alreadyCompleted.id,
      sourceId,
      alreadyImported: true,
      regionCode: input.regionCode,
      recordsScanned: alreadyCompleted.recordsScanned,
      recordsRetained: alreadyCompleted.recordsRetained,
      encoding: hunspellEncoding,
    };
  }

  const entries = parseHunspellDictionary(dicBuffer.toString(bufferEncoding));

  const lexicalImport = await createLexicalImport(db, {
    sourceId,
    // A regional word list is always ingested whole — it is small, and a
    // partial word list would produce false `not_listed` evidence, which is
    // precisely the misleading signal spec 12 warns against.
    scope: "full_language",
    scopeKey,
    fileChecksum,
    sourceVersion: input.sourceVersion ?? null,
  });

  let retained = 0;

  try {
    await db.transaction(async (tx) => {
      for (let offset = 0; offset < entries.length; offset += LEXEME_BATCH_SIZE) {
        const slice = entries.slice(offset, offset + LEXEME_BATCH_SIZE).map((entry) => ({
          regionCode: input.regionCode,
          word: entry.word,
          normalizedWord: entry.normalizedWord,
          affixFlags: entry.affixFlags,
        }));
        retained += await persistRegionalLexemeBatch(tx, {
          sourceId,
          importId: lexicalImport.id,
          entries: slice,
        });
      }

      await updateLexicalImport(tx, lexicalImport.id, {
        status: "completed",
        completedAt: input.now,
        recordsScanned: entries.length,
        recordsRetained: retained,
      });
    });
  } catch (error) {
    await updateLexicalImport(db, lexicalImport.id, {
      status: "failed",
      failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown regional import failure",
      recordsScanned: entries.length,
    });
    throw error;
  }

  return {
    importId: lexicalImport.id,
    sourceId,
    alreadyImported: false,
    regionCode: input.regionCode,
    recordsScanned: entries.length,
    recordsRetained: retained,
    encoding: hunspellEncoding,
  };
}
