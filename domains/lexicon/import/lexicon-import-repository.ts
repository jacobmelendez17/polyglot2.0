import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  dictionaryEntries,
  dictionaryEntryVersions,
  dictionaryForms,
  dictionaryPronunciations,
  dictionaryRelations,
  dictionarySenses,
  lexicalImports,
  lexicalSources,
  regionalLexemes,
} from "@/db/schema";

import type { LexicalImport, LexicalImportScope, LexicalImportStatus, LexicalSourceType } from "../lexicon-types";

import type { ProjectedDictionaryRecord } from "./import-types";
import { hashSourceValue } from "./source-hash";

/**
 * Every database write an import performs (spec 12 "Controlled Import",
 * "Import Versioning", "Reimports", "Removed Entries and Senses").
 *
 * Takes an injected `DbClient` like every other repository in this codebase,
 * so the same functions run against the real pooled connection under
 * `npm run lexicon:import` and against a rolled-back transaction under
 * `npm run test:integration` (see progress-tracker.md's Architecture
 * Decisions on why the `db` singleton is never imported here).
 *
 * Two invariants this module is responsible for upholding:
 *
 * - **It never writes a curriculum, progress, or SRS table.** Nothing here
 *   imports `learningItems`, `vocabularyItems`, `userItemProgress`, or
 *   `userLevelProgress`; a dictionary release physically cannot reorganize
 *   curriculum through this path.
 * - **It never deletes.** A record that disappears upstream is marked
 *   `missing_from_source`, because Polyglot may already reference it.
 */

type LexicalImportRow = typeof lexicalImports.$inferSelect;

function toLexicalImport(row: LexicalImportRow): LexicalImport {
  return {
    id: row.id,
    sourceId: row.sourceId,
    scope: row.scope,
    status: row.status,
    sourceVersion: row.sourceVersion,
    dumpDate: row.dumpDate,
    extractorVersion: row.extractorVersion,
    sourceCommit: row.sourceCommit,
    fileChecksum: row.fileChecksum,
    recordsScanned: row.recordsScanned,
    recordsRetained: row.recordsRetained,
    recordsRejected: row.recordsRejected,
    entriesCreated: row.entriesCreated,
    entriesUpdated: row.entriesUpdated,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureReason: row.failureReason,
  };
}

export interface UpsertLexicalSourceInput {
  code: string;
  provider: string;
  sourceType: LexicalSourceType;
  sourceLanguage: string;
  entryLanguage?: string | null;
  licenseMetadata: Record<string, unknown>;
  attributionText: string;
}

/**
 * Registers (or refreshes) a source definition. License metadata and
 * attribution are updated on every run so a corrected license record reaches
 * the database without a migration — spec 12 makes attribution a structural
 * requirement, not a one-time seed.
 */
export async function upsertLexicalSource(db: DbClient, input: UpsertLexicalSourceInput): Promise<string> {
  const [row] = await db
    .insert(lexicalSources)
    .values({
      code: input.code,
      provider: input.provider,
      sourceType: input.sourceType,
      sourceLanguage: input.sourceLanguage,
      entryLanguage: input.entryLanguage ?? null,
      licenseMetadata: input.licenseMetadata,
      attributionText: input.attributionText,
    })
    .onConflictDoUpdate({
      target: lexicalSources.code,
      set: {
        provider: input.provider,
        sourceType: input.sourceType,
        sourceLanguage: input.sourceLanguage,
        entryLanguage: input.entryLanguage ?? null,
        licenseMetadata: input.licenseMetadata,
        attributionText: input.attributionText,
        updatedAt: new Date(),
      },
    })
    .returning({ id: lexicalSources.id });
  return row.id;
}

/**
 * Spec 12's idempotency rule at its strongest point: importing the exact
 * same completed snapshot again must not duplicate lexical records. The
 * caller checks this *before* streaming a multi-gigabyte file, so a repeat
 * run costs one query rather than a full pass.
 */
export async function findCompletedImport(
  db: DbClient,
  input: { sourceId: string; fileChecksum: string; scopeKey: string },
): Promise<LexicalImport | null> {
  const [row] = await db
    .select()
    .from(lexicalImports)
    .where(
      and(
        eq(lexicalImports.sourceId, input.sourceId),
        eq(lexicalImports.fileChecksum, input.fileChecksum),
        eq(lexicalImports.scopeKey, input.scopeKey),
        eq(lexicalImports.status, "completed"),
      ),
    )
    .limit(1);
  return row ? toLexicalImport(row) : null;
}

/**
 * The stable digest that, with the file checksum, identifies "this exact
 * import again". A `terms` run folds its sorted term list in, because two
 * `terms` imports of the same dump with different lists retain different
 * data and must not be mistaken for each other.
 */
export function buildImportScopeKey(scope: LexicalImportScope, terms: readonly string[] = []): string {
  if (scope !== "terms") return scope;
  return `terms:${hashSourceValue([...terms].sort())}`;
}

export interface CreateLexicalImportInput {
  sourceId: string;
  scope: LexicalImportScope;
  scopeKey: string;
  fileChecksum: string;
  sourceVersion?: string | null;
  dumpDate?: Date | null;
  extractorVersion?: string | null;
  sourceCommit?: string | null;
}

export async function createLexicalImport(db: DbClient, input: CreateLexicalImportInput): Promise<LexicalImport> {
  const [row] = await db
    .insert(lexicalImports)
    .values({
      sourceId: input.sourceId,
      scope: input.scope,
      scopeKey: input.scopeKey,
      status: "staged",
      fileChecksum: input.fileChecksum,
      sourceVersion: input.sourceVersion ?? null,
      dumpDate: input.dumpDate ?? null,
      extractorVersion: input.extractorVersion ?? null,
      sourceCommit: input.sourceCommit ?? null,
    })
    // A previous attempt at the same snapshot that failed or was rolled back
    // leaves its row behind by design (the operational record must survive);
    // a retry reuses it rather than colliding with the unique constraint.
    .onConflictDoUpdate({
      target: [lexicalImports.sourceId, lexicalImports.fileChecksum, lexicalImports.scopeKey],
      set: {
        scope: input.scope,
        status: "staged",
        startedAt: new Date(),
        completedAt: null,
        failureReason: null,
        recordsScanned: 0,
        recordsRetained: 0,
        recordsRejected: 0,
        entriesCreated: 0,
        entriesUpdated: 0,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toLexicalImport(row);
}

export interface UpdateLexicalImportInput {
  status?: LexicalImportStatus;
  recordsScanned?: number;
  recordsRetained?: number;
  recordsRejected?: number;
  entriesCreated?: number;
  entriesUpdated?: number;
  completedAt?: Date | null;
  failureReason?: string | null;
}

export async function updateLexicalImport(
  db: DbClient,
  importId: string,
  patch: UpdateLexicalImportInput,
): Promise<LexicalImport> {
  const [row] = await db
    .update(lexicalImports)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(lexicalImports.id, importId))
    .returning();
  return toLexicalImport(row);
}

export interface PersistBatchInput {
  sourceId: string;
  languageId: string;
  importId: string;
  records: ProjectedDictionaryRecord[];
}

export interface PersistBatchResult {
  entriesCreated: number;
  entriesUpdated: number;
}

/**
 * Writes one bounded batch of projected records: entries, their raw source
 * version, and their relational projection. Called repeatedly inside one
 * transaction, so the whole release either becomes current or none of it
 * does — spec 12's "a failed import must never leave half of a new source
 * release active".
 *
 * `dictionary_entries.id` is preserved across reimports by construction:
 * every entry is reached through the `(source_id, source_entry_key)` unique
 * constraint and updated in place, never replaced. That single fact is what
 * keeps vocabulary mappings and selected senses attached through a source
 * update.
 */
export async function persistRecordBatch(db: DbClient, input: PersistBatchInput): Promise<PersistBatchResult> {
  const { sourceId, languageId, importId, records } = input;
  if (records.length === 0) return { entriesCreated: 0, entriesUpdated: 0 };

  const sourceEntryKeys = records.map((record) => record.sourceEntryKey);

  // Determine created-vs-updated up front rather than inferring it from the
  // upsert. `RETURNING (xmax = 0)` would also work but depends on a Postgres
  // implementation detail; these counters end up in operator-facing output,
  // so a plain, obviously-correct query is worth one extra round trip.
  const preExisting = await db
    .select({ sourceEntryKey: dictionaryEntries.sourceEntryKey })
    .from(dictionaryEntries)
    .where(
      and(
        eq(dictionaryEntries.sourceId, sourceId),
        eq(dictionaryEntries.languageId, languageId),
        inArray(dictionaryEntries.sourceEntryKey, sourceEntryKeys),
      ),
    );
  const preExistingKeys = new Set(preExisting.map((row) => row.sourceEntryKey));

  const now = new Date();
  const entryRows = await db
    .insert(dictionaryEntries)
    .values(
      records.map((record) => ({
        languageId,
        sourceId,
        lemma: record.lemma,
        normalizedLemma: record.normalizedLemma,
        partOfSpeech: record.partOfSpeech,
        sourceEntryKey: record.sourceEntryKey,
        sourceStatus: "active" as const,
        restrictedRegionCodes: record.restrictedRegionCodes,
        firstSeenImportId: importId,
        lastSeenImportId: importId,
      })),
    )
    .onConflictDoUpdate({
      target: [dictionaryEntries.sourceId, dictionaryEntries.languageId, dictionaryEntries.sourceEntryKey],
      set: {
        lemma: sql`excluded.lemma`,
        normalizedLemma: sql`excluded.normalized_lemma`,
        partOfSpeech: sql`excluded.part_of_speech`,
        restrictedRegionCodes: sql`excluded.restricted_region_codes`,
        // An entry that had gone missing and is published again upstream
        // returns to `active` — the same row, so every mapping survives.
        sourceStatus: "active",
        lastSeenImportId: importId,
        updatedAt: now,
      },
    })
    .returning({ id: dictionaryEntries.id, sourceEntryKey: dictionaryEntries.sourceEntryKey });

  const entryIdByKey = new Map(entryRows.map((row) => [row.sourceEntryKey, row.id]));

  await db
    .insert(dictionaryEntryVersions)
    .values(
      records.map((record) => ({
        dictionaryEntryId: entryIdByKey.get(record.sourceEntryKey)!,
        lexicalImportId: importId,
        sourceRecordKey: record.sourceEntryKey,
        sourceHash: record.sourceHash,
        rawData: record.rawData,
      })),
    )
    // The same unchanged record seen again keeps one version row rather than
    // accumulating identical copies — the raw-history half of idempotency.
    .onConflictDoNothing({ target: [dictionaryEntryVersions.dictionaryEntryId, dictionaryEntryVersions.sourceHash] });

  const senseValues = records.flatMap((record) =>
    record.senses.map((sense) => ({
      dictionaryEntryId: entryIdByKey.get(record.sourceEntryKey)!,
      sourceSenseKey: sense.sourceSenseKey,
      sourceFingerprint: sense.sourceFingerprint,
      senseOrder: sense.senseOrder,
      gloss: sense.gloss,
      tags: sense.tags,
      topics: sense.topics,
      sourceStatus: "active" as const,
      firstSeenImportId: importId,
      lastSeenImportId: importId,
    })),
  );
  if (senseValues.length > 0) {
    await db
      .insert(dictionarySenses)
      .values(senseValues)
      .onConflictDoUpdate({
        target: [dictionarySenses.dictionaryEntryId, dictionarySenses.sourceSenseKey],
        set: {
          sourceFingerprint: sql`excluded.source_fingerprint`,
          senseOrder: sql`excluded.sense_order`,
          gloss: sql`excluded.gloss`,
          tags: sql`excluded.tags`,
          topics: sql`excluded.topics`,
          sourceStatus: "active",
          lastSeenImportId: importId,
          updatedAt: now,
        },
      });
  }

  const formValues = records.flatMap((record) =>
    record.forms.map((form) => ({
      dictionaryEntryId: entryIdByKey.get(record.sourceEntryKey)!,
      form: form.form,
      normalizedForm: form.normalizedForm,
      tags: form.tags,
      sourceFingerprint: form.sourceFingerprint,
      sourceStatus: "active" as const,
      firstSeenImportId: importId,
      lastSeenImportId: importId,
    })),
  );
  if (formValues.length > 0) {
    await db
      .insert(dictionaryForms)
      .values(formValues)
      .onConflictDoUpdate({
        target: [dictionaryForms.dictionaryEntryId, dictionaryForms.sourceFingerprint],
        set: { sourceStatus: "active", lastSeenImportId: importId, updatedAt: now },
      });
  }

  const pronunciationValues = records.flatMap((record) =>
    record.pronunciations.map((pronunciation) => ({
      dictionaryEntryId: entryIdByKey.get(record.sourceEntryKey)!,
      ipa: pronunciation.ipa,
      regionCode: pronunciation.regionCode,
      tags: pronunciation.tags,
      audioUrl: pronunciation.audioUrl,
      sourceFingerprint: pronunciation.sourceFingerprint,
      sourceStatus: "active" as const,
      firstSeenImportId: importId,
      lastSeenImportId: importId,
    })),
  );
  if (pronunciationValues.length > 0) {
    await db
      .insert(dictionaryPronunciations)
      .values(pronunciationValues)
      .onConflictDoUpdate({
        target: [dictionaryPronunciations.dictionaryEntryId, dictionaryPronunciations.sourceFingerprint],
        set: { sourceStatus: "active", lastSeenImportId: importId, updatedAt: now },
      });
  }

  const relationValues = records.flatMap((record) =>
    record.relations.map((relation) => ({
      dictionaryEntryId: entryIdByKey.get(record.sourceEntryKey)!,
      relationType: relation.relationType,
      targetLemma: relation.targetLemma,
      normalizedTargetLemma: relation.normalizedTargetLemma,
      sourceStatus: "active" as const,
      firstSeenImportId: importId,
      lastSeenImportId: importId,
    })),
  );
  if (relationValues.length > 0) {
    await db
      .insert(dictionaryRelations)
      .values(relationValues)
      .onConflictDoUpdate({
        target: [dictionaryRelations.dictionaryEntryId, dictionaryRelations.relationType, dictionaryRelations.normalizedTargetLemma],
        set: { targetLemma: sql`excluded.target_lemma`, sourceStatus: "active", lastSeenImportId: importId, updatedAt: now },
      });
  }

  let entriesCreated = 0;
  let entriesUpdated = 0;
  for (const key of sourceEntryKeys) {
    if (preExistingKeys.has(key)) entriesUpdated += 1;
    else entriesCreated += 1;
  }
  return { entriesCreated, entriesUpdated };
}

/**
 * Marks everything this import looked at but did not see (spec 12 "Removed
 * Entries and Senses"). Nothing is deleted.
 *
 * Scope matters here more than anywhere else in the importer: a
 * `curriculum`-scope import only searched the lemmas the curriculum needs,
 * so it may only mark *those* as missing. Marking every unseen entry would
 * wrongly declare the entire rest of the dictionary deleted on every
 * partial import.
 */
export async function markRecordsMissingFromSource(
  db: DbClient,
  input: { sourceId: string; languageId: string; importId: string; wantedForms: string[] | null },
): Promise<{ entriesMarked: number; sensesMarked: number }> {
  const { sourceId, languageId, importId, wantedForms } = input;

  // Always scoped to the language this import ran for: one source can serve
  // several Polyglot languages, and an import of one must never declare
  // another language's entries deleted.
  const sourceScope = and(eq(dictionaryEntries.sourceId, sourceId), eq(dictionaryEntries.languageId, languageId));
  const entryScope =
    wantedForms === null
      ? sourceScope
      : wantedForms.length === 0
        ? null
        : and(sourceScope, inArray(dictionaryEntries.normalizedLemma, wantedForms));

  let entriesMarked = 0;
  if (entryScope) {
    const marked = await db
      .update(dictionaryEntries)
      .set({ sourceStatus: "missing_from_source", updatedAt: new Date() })
      .where(
        and(
          entryScope,
          eq(dictionaryEntries.sourceStatus, "active"),
          or(isNull(dictionaryEntries.lastSeenImportId), ne(dictionaryEntries.lastSeenImportId, importId)),
        ),
      )
      .returning({ id: dictionaryEntries.id });
    entriesMarked = marked.length;
  }

  // Child records are scoped to the entries this import actually touched, so
  // an entry outside this import's scope keeps its senses untouched.
  const touchedEntryIds = db
    .select({ id: dictionaryEntries.id })
    .from(dictionaryEntries)
    .where(and(sourceScope, eq(dictionaryEntries.lastSeenImportId, importId)));

  const markedSenses = await db
    .update(dictionarySenses)
    .set({ sourceStatus: "missing_from_source", updatedAt: new Date() })
    .where(
      and(
        inArray(dictionarySenses.dictionaryEntryId, touchedEntryIds),
        eq(dictionarySenses.sourceStatus, "active"),
        or(isNull(dictionarySenses.lastSeenImportId), ne(dictionarySenses.lastSeenImportId, importId)),
      ),
    )
    .returning({ id: dictionarySenses.id });

  await db
    .update(dictionaryForms)
    .set({ sourceStatus: "missing_from_source", updatedAt: new Date() })
    .where(
      and(
        inArray(dictionaryForms.dictionaryEntryId, touchedEntryIds),
        eq(dictionaryForms.sourceStatus, "active"),
        or(isNull(dictionaryForms.lastSeenImportId), ne(dictionaryForms.lastSeenImportId, importId)),
      ),
    );

  await db
    .update(dictionaryPronunciations)
    .set({ sourceStatus: "missing_from_source", updatedAt: new Date() })
    .where(
      and(
        inArray(dictionaryPronunciations.dictionaryEntryId, touchedEntryIds),
        eq(dictionaryPronunciations.sourceStatus, "active"),
        or(isNull(dictionaryPronunciations.lastSeenImportId), ne(dictionaryPronunciations.lastSeenImportId, importId)),
      ),
    );

  await db
    .update(dictionaryRelations)
    .set({ sourceStatus: "missing_from_source", updatedAt: new Date() })
    .where(
      and(
        inArray(dictionaryRelations.dictionaryEntryId, touchedEntryIds),
        eq(dictionaryRelations.sourceStatus, "active"),
        or(isNull(dictionaryRelations.lastSeenImportId), ne(dictionaryRelations.lastSeenImportId, importId)),
      ),
    );

  return { entriesMarked, sensesMarked: markedSenses.length };
}

/**
 * Resolves `dictionary_relations.target_dictionary_entry_id` for targets that
 * happen to be imported too. A synonym pointing outside the imported scope
 * keeps its written lemma and a null entry id — it is still real evidence,
 * and dropping it would lose information the admin UI can legitimately show.
 */
export async function resolveRelationTargets(
  db: DbClient,
  input: { sourceId: string; languageId: string; importId: string },
): Promise<number> {
  const resolved = await db
    .update(dictionaryRelations)
    .set({ targetDictionaryEntryId: sql`${dictionaryEntries.id}`, updatedAt: new Date() })
    .from(dictionaryEntries)
    .where(
      and(
        eq(dictionaryRelations.lastSeenImportId, input.importId),
        isNull(dictionaryRelations.targetDictionaryEntryId),
        eq(dictionaryEntries.sourceId, input.sourceId),
        eq(dictionaryEntries.languageId, input.languageId),
        eq(dictionaryEntries.normalizedLemma, dictionaryRelations.normalizedTargetLemma),
      ),
    )
    .returning({ id: dictionaryRelations.id });
  return resolved.length;
}

export interface RegionalLexemeInput {
  regionCode: string;
  word: string;
  normalizedWord: string;
  affixFlags: string | null;
}

/** Upserts one batch of regional word-list rows (spec 12 "RLA Import"). */
export async function persistRegionalLexemeBatch(
  db: DbClient,
  input: { sourceId: string; importId: string; entries: RegionalLexemeInput[] },
): Promise<number> {
  if (input.entries.length === 0) return 0;
  const rows = await db
    .insert(regionalLexemes)
    .values(
      input.entries.map((entry) => ({
        sourceId: input.sourceId,
        lexicalImportId: input.importId,
        regionCode: entry.regionCode,
        word: entry.word,
        normalizedWord: entry.normalizedWord,
        affixFlags: entry.affixFlags,
      })),
    )
    .onConflictDoUpdate({
      target: [regionalLexemes.sourceId, regionalLexemes.regionCode, regionalLexemes.normalizedWord],
      set: {
        word: sql`excluded.word`,
        affixFlags: sql`excluded.affix_flags`,
        lexicalImportId: input.importId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: regionalLexemes.id });
  return rows.length;
}
