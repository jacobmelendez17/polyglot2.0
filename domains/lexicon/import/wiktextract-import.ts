import type { DbClient } from "@/db/client";

import { composeVocabularyDisplayWord, getLexicalLanguageProvider } from "../lexical-language-provider";
import { normalizeLexicalForm } from "../lexical-normalization";
import type { LexicalSourceDefinition } from "../lexical-source-registry";
import { getMatchableVocabularyItems } from "../lexicon-repository";
import type { LexicalImportScope } from "../lexicon-types";

import { assertImportFileSize, readJsonlFile } from "./jsonl-stream";
import type { ImportCounters, ProjectedDictionaryRecord } from "./import-types";
import { reachableForms } from "./import-types";
import {
  buildImportScopeKey,
  createLexicalImport,
  findCompletedImport,
  markRecordsMissingFromSource,
  persistRecordBatch,
  resolveRelationTargets,
  updateLexicalImport,
  upsertLexicalSource,
} from "./lexicon-import-repository";
import { hashFile } from "./source-hash";
import { createEntryKeyDisambiguator, projectWiktextractRecord } from "./wiktextract-adapter";
import { wiktextractRecordSchema } from "./wiktextract-schema";

/**
 * Spec 12's dictionary import: `JSONL → streaming parser → validation →
 * staged lexical records → normalized projection + raw JSONB → finalize`.
 *
 * Shape of the guarantee this function makes:
 *
 * - **Idempotent.** The same completed snapshot re-imported is recognized by
 *   checksum before a single line is parsed, and returns without touching
 *   anything.
 * - **Atomic.** The entire projection runs in one transaction, so a failure
 *   part-way through cannot leave half of a new source release current. The
 *   `lexical_imports` row is written outside it, so the operational record
 *   of a failed attempt survives the rollback that discards its data.
 * - **Bounded.** Records stream one line at a time and are flushed in fixed
 *   batches; nothing accumulates the dump in memory.
 * - **Non-destructive.** Nothing is deleted, and nothing outside the
 *   `lexicon` tables is written at all — a dictionary release physically
 *   cannot reorganize curriculum, reset SRS, or touch learner progress.
 */

/** Records per flush. Large enough to amortize round trips, small enough that one batch's parameters stay well inside Postgres's limits. */
const RECORD_BATCH_SIZE = 200;

export interface RunDictionaryImportInput {
  filePath: string;
  languageId: string;
  languageCode: string;
  sourceDefinition: LexicalSourceDefinition;
  scope: LexicalImportScope;
  /** Explicit terms to retain when `scope` is `terms`. Ignored otherwise. */
  terms?: string[];
  sourceVersion?: string | null;
  extractorVersion?: string | null;
  dumpDate?: Date | null;
  now: Date;
  /**
   * Re-ingests a snapshot that has already been imported successfully.
   *
   * The "already imported" short-circuit is keyed by source, file checksum
   * and scope — deliberately, so re-running the CLI cannot duplicate work.
   * It cannot see the one thing that legitimately invalidates a completed
   * import: a change to the *importer itself*. After fixing a projection or
   * validation bug, the same file genuinely does yield different rows, and
   * this is how an operator says so.
   */
  force?: boolean;
  /** Operational progress callback — the CLI prints from this. Never given record content. */
  onProgress?: (counters: ImportCounters) => void;
}

export interface DictionaryImportResult extends ImportCounters {
  importId: string;
  sourceId: string;
  /** True when the identical snapshot had already been imported and nothing was done. */
  alreadyImported: boolean;
  entriesMarkedMissing: number;
  sensesMarkedMissing: number;
  relationsResolved: number;
}

/**
 * Which normalized forms a `curriculum`-scope import should retain: every
 * lookup form the language provider derives from every vocabulary item that
 * currently exists. This is what keeps the default import small enough for
 * Neon while preserving the option of full-language ingestion later.
 */
export async function buildCurriculumScopeForms(
  db: DbClient,
  input: { languageId: string; languageCode: string },
): Promise<Set<string>> {
  const provider = getLexicalLanguageProvider(input.languageCode);
  const items = await getMatchableVocabularyItems(db, input.languageId);
  const forms = new Set<string>();
  for (const item of items) {
    for (const form of provider.deriveDictionaryLookups(composeVocabularyDisplayWord(item.term, item.article))) {
      forms.add(form);
    }
  }
  return forms;
}

export async function runDictionaryImport(
  db: DbClient,
  input: RunDictionaryImportInput,
): Promise<DictionaryImportResult> {
  assertImportFileSize(input.filePath);

  const sourceId = await upsertLexicalSource(db, input.sourceDefinition);
  const fileChecksum = await hashFile(input.filePath);
  const scopeKey = buildImportScopeKey(input.scope, input.terms ?? []);

  const alreadyCompleted = input.force ? null : await findCompletedImport(db, { sourceId, fileChecksum, scopeKey });
  if (alreadyCompleted) {
    return {
      importId: alreadyCompleted.id,
      sourceId,
      alreadyImported: true,
      recordsScanned: alreadyCompleted.recordsScanned,
      recordsRetained: alreadyCompleted.recordsRetained,
      recordsRejected: alreadyCompleted.recordsRejected,
      entriesCreated: 0,
      entriesUpdated: 0,
      entriesMarkedMissing: 0,
      sensesMarkedMissing: 0,
      relationsResolved: 0,
    };
  }

  const wantedForms =
    input.scope === "full_language"
      ? null
      : input.scope === "terms"
        // Normalized the same way stored lemmas and forms are — an operator
        // typing "Buenos Días" must reach the same records as "buenos días",
        // and comparing a raw term against a normalized lemma would silently
        // retain nothing.
        ? new Set((input.terms ?? []).map(normalizeLexicalForm).filter((term) => term.length > 0))
        : await buildCurriculumScopeForms(db, { languageId: input.languageId, languageCode: input.languageCode });

  const lexicalImport = await createLexicalImport(db, {
    sourceId,
    scope: input.scope,
    scopeKey,
    fileChecksum,
    sourceVersion: input.sourceVersion ?? null,
    dumpDate: input.dumpDate ?? null,
    extractorVersion: input.extractorVersion ?? null,
  });

  const counters: ImportCounters = {
    recordsScanned: 0,
    recordsRetained: 0,
    recordsRejected: 0,
    entriesCreated: 0,
    entriesUpdated: 0,
  };
  let entriesMarkedMissing = 0;
  let sensesMarkedMissing = 0;
  let relationsResolved = 0;

  try {
    await db.transaction(async (tx) => {
      let batch: ProjectedDictionaryRecord[] = [];
      // Spans the whole import, not one batch: two records with the same
      // natural key can land in different batches, where a batch-local
      // check would miss the repeat and silently merge the second record
      // into the first entry instead of erroring.
      const disambiguateEntryKey = createEntryKeyDisambiguator();

      const flush = async () => {
        if (batch.length === 0) return;
        const result = await persistRecordBatch(tx, {
          sourceId,
          languageId: input.languageId,
          importId: lexicalImport.id,
          records: batch,
        });
        counters.entriesCreated += result.entriesCreated;
        counters.entriesUpdated += result.entriesUpdated;
        batch = [];
        input.onProgress?.({ ...counters });
      };

      for await (const line of readJsonlFile(input.filePath)) {
        counters.recordsScanned += 1;

        if (line.parseError !== null) {
          counters.recordsRejected += 1;
          continue;
        }

        // Cheap language filter before validation: a full Kaikki extract is
        // mostly other languages, and running Zod over every one of them
        // would dominate the import's cost for no benefit.
        //
        // Filters on the *source's* language (`es`), not Polyglot's own
        // `languages.code` (`es-MX`). Conflating the two would silently
        // retain nothing at all, since no Wiktextract record is tagged with
        // a regional code.
        const rawLanguage = (line.value as { lang_code?: unknown } | null)?.lang_code;
        if (rawLanguage !== input.sourceDefinition.sourceLanguage) continue;

        const parsed = wiktextractRecordSchema.safeParse(line.value);
        if (!parsed.success) {
          counters.recordsRejected += 1;
          continue;
        }

        const projected = projectWiktextractRecord(parsed.data);
        if (!projected) {
          counters.recordsRejected += 1;
          continue;
        }

        if (wantedForms && !reachableForms(projected).some((form) => wantedForms.has(form))) continue;

        counters.recordsRetained += 1;
        // Applied only to retained records, and only once the record is
        // certain to be written — so a filtered-out record never consumes an
        // occurrence and shifts a later entry's key.
        batch.push({ ...projected, sourceEntryKey: disambiguateEntryKey(projected.sourceEntryKey) });
        if (batch.length >= RECORD_BATCH_SIZE) await flush();
      }

      await flush();

      const missing = await markRecordsMissingFromSource(tx, {
        sourceId,
        languageId: input.languageId,
        importId: lexicalImport.id,
        wantedForms: wantedForms ? [...wantedForms] : null,
      });
      entriesMarkedMissing = missing.entriesMarked;
      sensesMarkedMissing = missing.sensesMarked;

      relationsResolved = await resolveRelationTargets(tx, {
        sourceId,
        languageId: input.languageId,
        importId: lexicalImport.id,
      });

      // Finalization is the last statement inside the transaction: the
      // import only becomes `completed` — and therefore current — if
      // everything above it committed.
      await updateLexicalImport(tx, lexicalImport.id, {
        status: "completed",
        completedAt: input.now,
        ...counters,
      });
    });
  } catch (error) {
    // The import row lives outside the rolled-back transaction, so the
    // failure is recorded even though none of its data survives. The reason
    // is the error's message only — never a source record, a file path, or a
    // stack trace (spec 12's security rules).
    await updateLexicalImport(db, lexicalImport.id, {
      status: "failed",
      failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown import failure",
      ...counters,
    });
    throw error;
  }

  return {
    importId: lexicalImport.id,
    sourceId,
    alreadyImported: false,
    ...counters,
    entriesMarkedMissing,
    sensesMarkedMissing,
    relationsResolved,
  };
}
