import { config } from "dotenv";

// Runs as a standalone `tsx` CLI, outside Next.js's own env loading — load
// .env.local the same way `db/seed/run.ts` and `scripts/lexicon-import.ts`
// do, before anything else touches process.env.
config({ path: ".env.local" });

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import type { DbClient } from "@/db/client";
import * as schema from "@/db/schema";
import { learningItems, levels, users, vocabularyGroups } from "@/db/schema";
import {
  ITEM_AGUA_ID,
  ITEM_CASA_ID,
  ITEM_GATO_ID,
  ITEM_ROJO_ID,
  ITEM_Y_ID,
} from "@/db/seed/test-fixtures";
import {
  archiveItem,
  createLevel,
  createVocabularyGroup,
} from "@/domains/admin/publication-service";
import {
  bulkImportVocabulary,
  previewVocabularyImport,
} from "@/domains/admin/bulk-import-service";
import type {
  ImportRowDecision,
  ImportRowPreview,
} from "@/domains/admin/bulk-import-service";
import {
  GRAMMAR_GROUP_NUMBER,
  MAX_VOCABULARY_GROUP_NUMBER,
  validateVocabularyImportRow,
} from "@/domains/curriculum/vocabulary-import-parsing";
import type { ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import { parseVocabularyImportFile } from "@/domains/curriculum/vocabulary-import-file-parser";
import { matchImportedVocabularyItems } from "@/domains/lexicon/lexicon-mapping-service";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * `npm run curriculum:import` (spec 16, "Level 1 Real Curriculum").
 *
 * Loads one authored curriculum file from `/content/curriculum` into the
 * real database **once**, through the same `domains/admin` import path the
 * Admin bulk-upload dialog uses — same validation, same duplicate
 * detection, same audit events, same Pending status, same Lexicon
 * dictionary matching afterwards. Nothing here re-implements curriculum
 * rules; the CSV is authoring input, never a runtime data source, and the
 * application reads the database from then on.
 *
 * Like every other CLI in `/scripts`, it builds its own database client
 * rather than importing `db/client.ts` (whose `server-only` guard throws
 * under plain `tsx`) and calls the `DbClient`-injectable services directly
 * rather than their server-only bindings. Rate limiting is a request-path
 * concern and is deliberately absent: this is a developer operation run
 * from a terminal, not an endpoint.
 *
 * Every write is wrapped in an idempotency key derived from the file's own
 * content hash, so running it twice is a replay rather than a second
 * import — the safety property that matters most for a script that creates
 * real curriculum. A re-run still *previews* first, so it reports every row
 * as an existing duplicate of the copy the first run created; the counts it
 * prints afterwards come from the replayed result, and no second row is
 * written.
 *
 * Usage:
 *   npm run curriculum:import -- --actor <user id | Clerk id> --dry-run
 *   npm run curriculum:import -- --actor <user id | Clerk id>
 *   npm run curriculum:import -- --actor <id> --archive-seed-fixtures
 *   npm run curriculum:import -- --manifest content/curriculum/spanish-level-2.manifest.json --actor <id>
 */

const DEFAULT_MANIFEST_PATH =
  "content/curriculum/spanish-level-1.manifest.json";

/**
 * A stable idempotency key for one step of one file's import.
 * `idempotency_keys.key` is a real `uuid` column, so a readable string like
 * `level-1:group-2` cannot be stored — this hashes the step name into a
 * v4-shaped UUID instead, which keeps the property that matters: the same
 * file and the same step always produce the same key, so re-running the
 * script replays rather than imports twice.
 */
function stepKey(namespace: string, step: string): string {
  const digest = createHash("sha256").update(`${namespace}:${step}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The seeded demo items `db/seed/test-fixtures.ts` puts in Levels 1-2 — the "dummy data" the authored curriculum replaces. */
const SEED_FIXTURE_ITEM_IDS = [
  ITEM_GATO_ID,
  ITEM_CASA_ID,
  ITEM_AGUA_ID,
  ITEM_Y_ID,
  ITEM_ROJO_ID,
] as const;

const manifestSchema = z.object({
  languageCode: z.string().min(1),
  levelNumber: z.number().int().min(1),
  levelName: z.string().min(1).nullish(),
  file: z.string().min(1),
  delimiter: z.enum([",", "\t"]).default(","),
  themes: z
    .array(
      z.object({
        groupNumber: z.number().int().min(1).max(MAX_VOCABULARY_GROUP_NUMBER),
        name: z.string().min(1),
      }),
    )
    .min(1),
});

type Manifest = z.infer<typeof manifestSchema>;

type CliOptions = {
  manifestPath: string;
  actor: string | null;
  dryRun: boolean;
  archiveSeedFixtures: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    manifestPath: DEFAULT_MANIFEST_PATH,
    actor: null,
    dryRun: false,
    archiveSeedFixtures: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--manifest":
        options.manifestPath = argv[++i] ?? options.manifestPath;
        break;
      case "--actor":
        options.actor = argv[++i] ?? null;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--archive-seed-fixtures":
        options.archiveSeedFixtures = true;
        break;
      default:
        throw new Error(
          `Unknown argument "${arg}". See the usage block in scripts/curriculum-import.ts.`,
        );
    }
  }

  return options;
}

/**
 * The actor every audit event is attributed to. Required and never
 * defaulted to "some user": these are real admin curriculum mutations, and
 * an unattributable one is worse than a failed run.
 */
async function resolveActor(
  db: DbClient,
  requested: string | null,
): Promise<{ id: string; role: string }> {
  const privileged = await db
    .select({ id: users.id, role: users.role, clerkUserId: users.clerkUserId })
    .from(users)
    .where(or(eq(users.role, "admin"), eq(users.role, "developer")));

  if (requested) {
    const match = privileged.find(
      (user) => user.id === requested || user.clerkUserId === requested,
    );
    if (!match) {
      throw new Error(
        `No admin or developer user matches "${requested}" (matched against both the internal user id and the Clerk user id). ` +
          `Privileged users currently in this database: ${privileged.length === 0 ? "none" : privileged.map((u) => `${u.id} (${u.role})`).join(", ")}.`,
      );
    }
    return { id: match.id, role: match.role };
  }

  if (privileged.length === 1)
    return { id: privileged[0]!.id, role: privileged[0]!.role };

  throw new Error(
    privileged.length === 0
      ? "This database has no admin or developer user to attribute the import to. Elevate an account's `users.role` first, then re-run with --actor <user id>."
      : `Several admin/developer users exist — pass --actor explicitly. Candidates: ${privileged.map((u) => `${u.id} (${u.role})`).join(", ")}.`,
  );
}

async function resolveLevelId(
  db: DbClient,
  manifest: Manifest,
  languageId: string,
  actorUserId: string,
  keyPrefix: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: levels.id })
    .from(levels)
    .where(
      and(
        eq(levels.languageId, languageId),
        eq(levels.levelNumber, manifest.levelNumber),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const { levelId } = await createLevel(db, {
    languageId,
    levelNumber: manifest.levelNumber,
    name: manifest.levelName ?? null,
    actorUserId,
    idempotencyKey: stepKey(keyPrefix, "level"),
  });
  console.log(`  created Level ${manifest.levelNumber}`);
  return levelId;
}

/**
 * Creates only the vocabulary groups the manifest names and the level does
 * not already have, matched by position. An existing group is never renamed
 * — a theme name is authored curriculum content, and silently overwriting
 * one from a manifest would be exactly the kind of invisible curriculum
 * mutation the architecture forbids. A mismatch is reported instead.
 */
async function ensureThemeGroups(
  db: DbClient,
  manifest: Manifest,
  {
    languageId,
    levelId,
    actorUserId,
    keyPrefix,
  }: {
    languageId: string;
    levelId: string;
    actorUserId: string;
    keyPrefix: string;
  },
): Promise<void> {
  const existing = await db
    .select({
      id: vocabularyGroups.id,
      name: vocabularyGroups.name,
      position: vocabularyGroups.position,
    })
    .from(vocabularyGroups)
    .where(eq(vocabularyGroups.levelId, levelId));
  const byPosition = new Map(existing.map((group) => [group.position, group]));

  for (const theme of [...manifest.themes].sort(
    (a, b) => a.groupNumber - b.groupNumber,
  )) {
    const current = byPosition.get(theme.groupNumber);
    if (current) {
      if (current.name !== theme.name) {
        console.warn(
          `  ! group ${theme.groupNumber} is named "${current.name}" in the database, not "${theme.name}" — left as it is. Rename it in Admin if the manifest is right.`,
        );
      }
      continue;
    }

    // `createVocabularyGroup` appends at max(position) + 1, so groups must
    // be created in ascending order for position to equal groupNumber —
    // which the sort above guarantees. A gap in the manifest would land the
    // group at the wrong number, so refuse rather than mis-number it.
    const nextPosition = Math.max(0, ...[...byPosition.keys()]) + 1;
    if (nextPosition !== theme.groupNumber) {
      throw new Error(
        `Cannot create group ${theme.groupNumber} ("${theme.name}"): the next free position in this level is ${nextPosition}. Fill the gap in the manifest, or create the group in Admin.`,
      );
    }

    const { groupId } = await createVocabularyGroup(db, {
      levelId,
      languageId,
      name: theme.name,
      actorUserId,
      idempotencyKey: stepKey(keyPrefix, `group-${theme.groupNumber}`),
    });
    byPosition.set(theme.groupNumber, {
      id: groupId,
      name: theme.name,
      position: theme.groupNumber,
    });
    console.log(`  created group ${theme.groupNumber} "${theme.name}"`);
  }
}

/** Archives the seeded demo items so the authored curriculum is the only teachable Level 1 content. Archive, never delete: learner progress and notes reference these rows. */
async function archiveSeedFixtures(
  db: DbClient,
  { actorUserId, keyPrefix }: { actorUserId: string; keyPrefix: string },
): Promise<void> {
  const present = await db
    .select({ id: learningItems.id, status: learningItems.status })
    .from(learningItems)
    .where(inArray(learningItems.id, [...SEED_FIXTURE_ITEM_IDS]));

  for (const item of present) {
    if (item.status === "archived") {
      console.log(`  ${item.id} already archived`);
      continue;
    }
    await archiveItem(db, {
      learningItemId: item.id,
      actorUserId,
      reason: "Replaced by the authored curriculum import (spec 16).",
      // Keyed by the status being archived *from*, not by the item alone.
      // Archiving an item that has since been re-published (which
      // `db/seed/test-fixtures.ts` did, before it learned not to) is a
      // genuinely new operation, and a key that ignored the transition would
      // replay the first archive's stored result and quietly write nothing.
      idempotencyKey: stepKey(
        keyPrefix,
        `archive:${item.id}:from-${item.status}`,
      ),
    });
    console.log(`  archived seeded item ${item.id}`);
  }

  const missing = SEED_FIXTURE_ITEM_IDS.filter(
    (id) => !present.some((item) => item.id === id),
  );
  if (missing.length > 0)
    console.log(
      `  ${missing.length} seeded item(s) not present in this database — nothing to archive`,
    );
}

function describeRow(preview: ImportRowPreview): string {
  const label = preview.fields
    ? preview.fields.itemType === "vocabulary"
      ? preview.fields.term
      : preview.fields.structure
    : (preview.raw.word ?? "?");
  return `row ${preview.rowNumber} (${label})`;
}

/**
 * Prints what the file would do and returns the rows worth sending.
 *
 * Rows that would change nothing are still sent: the service classifies them
 * itself against fresh data and counts them as unchanged, and dropping them
 * here would mean the CLI and the Admin dialog disagreed about what
 * "import this row" means.
 */
function reportPreview(previews: ImportRowPreview[]): {
  importable: ImportRowDecision[];
  blocked: number;
  counts: Record<string, number>;
} {
  const importable: ImportRowDecision[] = [];
  const counts: Record<string, number> = {
    create: 0,
    update: 0,
    move: 0,
    unchanged: 0,
    blocked: 0,
  };
  let blocked = 0;

  for (const preview of previews) {
    counts[preview.action] = (counts[preview.action] ?? 0) + 1;

    if (!preview.fields) {
      blocked += 1;
      console.warn(
        `  ! ${describeRow(preview)} skipped: ${preview.fieldIssues.map((issue) => issue.message).join(" ")}`,
      );
      continue;
    }
    if (preview.action === "blocked") {
      blocked += 1;
      console.warn(
        `  ! ${describeRow(preview)} skipped: ${preview.blockedReason}`,
      );
      continue;
    }
    if (preview.action === "update") {
      console.log(
        `  ~ ${describeRow(preview)} updates ${preview.changes.map((change) => change.field).join(", ")}${preview.savesAsDraft ? " (as a draft — published item)" : ""}`,
      );
    }
    if (preview.action === "move" && preview.placement) {
      const { fromLevelNumber, toLevelNumber, fromGroupNumber, toGroupNumber } =
        preview.placement;
      console.log(
        `  → ${describeRow(preview)} moves L${fromLevelNumber}·G${fromGroupNumber ?? "-"} → L${toLevelNumber}·G${toGroupNumber ?? "-"}`,
      );
    }
    if (preview.duplicateOfEarlierRow !== null) {
      console.warn(
        `  ! ${describeRow(preview)} repeats row ${preview.duplicateOfEarlierRow} in this same file — importing both.`,
      );
    }
    if (preview.existingDuplicates.length > 0) {
      console.warn(
        `  ! ${describeRow(preview)} already exists in the curriculum as ${preview.existingDuplicates.map((candidate) => `${candidate.displayLabel} [${candidate.status}]`).join(", ")} — importing as an approved homonym.`,
      );
    }
    importable.push({ fields: preview.fields, decision: "import" });
  }

  return { importable, blocked, counts };
}

/**
 * A dry run's rollback signal. Thrown after the plan has been applied and
 * reported inside a transaction, so the transaction unwinds and nothing
 * survives — the only way to tell an admin what the import would *really*
 * do (including the rows that only become importable once this run's own
 * groups exist) without leaving those groups behind when they asked a
 * question rather than gave an instruction.
 */
class DryRunRollback extends Error {}

type ImportContext = {
  manifest: Manifest;
  languageId: string;
  actorUserId: string;
  keyPrefix: string;
  validatedRows: ValidatedImportRow[];
  archiveSeedFixtures: boolean;
};

/** Everything both a dry run and a real run do: level, groups, targets, optional fixture archiving, then the preview report. */
async function prepareAndPreview(
  db: DbClient,
  context: ImportContext,
): Promise<{
  importable: ImportRowDecision[];
  blocked: number;
  counts: Record<string, number>;
}> {
  const levelId = await resolveLevelId(
    db,
    context.manifest,
    context.languageId,
    context.actorUserId,
    context.keyPrefix,
  );
  await ensureThemeGroups(db, context.manifest, {
    languageId: context.languageId,
    levelId,
    actorUserId: context.actorUserId,
    keyPrefix: context.keyPrefix,
  });

  if (context.archiveSeedFixtures) {
    await archiveSeedFixtures(db, {
      actorUserId: context.actorUserId,
      keyPrefix: context.keyPrefix,
    });
  }

  const previews = await previewVocabularyImport(db, {
    languageId: context.languageId,
    validatedRows: context.validatedRows,
  });
  return reportPreview(previews);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required. Set it in .env.local.");

  const manifestPath = resolve(process.cwd(), options.manifestPath);
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  const csvPath = resolve(dirname(manifestPath), manifest.file);
  const csvContent = readFileSync(csvPath, "utf8");
  const contentHash = createHash("sha256")
    .update(csvContent)
    .digest("hex")
    .slice(0, 16);
  const keyPrefix = `curriculum-import:${manifest.languageCode}:level-${manifest.levelNumber}:${contentHash}`;

  const parsed = parseVocabularyImportFile(csvContent, manifest.delimiter);
  if (!parsed.ok) {
    throw new Error(
      parsed.error.type === "missing_columns"
        ? `${manifest.file} is missing required column(s): ${parsed.error.columns.join(", ")}.`
        : parsed.error.type === "too_many_rows"
          ? `${manifest.file} has ${parsed.error.count} rows, over the import cap.`
          : `${manifest.file} could not be parsed: ${parsed.error.message}`,
    );
  }

  const validatedRows = parsed.rows.map((row, index) =>
    validateVocabularyImportRow(row, index),
  );
  const vocabularyRows = validatedRows.filter(
    (row) => row.fields?.itemType === "vocabulary",
  ).length;
  const grammarRows = validatedRows.filter(
    (row) => row.fields?.itemType === "grammar",
  ).length;

  console.log(`Curriculum import — ${manifest.file} (${contentHash})`);
  console.log(
    `  ${validatedRows.length} rows: ${vocabularyRows} vocabulary, ${grammarRows} grammar (group ${GRAMMAR_GROUP_NUMBER})`,
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });

    const [language] = await db
      .select({ id: schema.languages.id })
      .from(schema.languages)
      .where(eq(schema.languages.code, manifest.languageCode))
      .limit(1);
    if (!language)
      throw new Error(
        `Language "${manifest.languageCode}" does not exist in this database.`,
      );

    const actor = await resolveActor(db, options.actor);
    console.log(`  actor: ${actor.id} (${actor.role})`);

    const context: ImportContext = {
      manifest,
      languageId: language.id,
      actorUserId: actor.id,
      keyPrefix,
      validatedRows,
      archiveSeedFixtures: options.archiveSeedFixtures,
    };

    if (options.dryRun) {
      try {
        await db.transaction(async (tx) => {
          const { importable, blocked, counts } = await prepareAndPreview(
            tx,
            context,
          );
          console.log(
            `Dry run: ${counts.create} new, ${counts.update} updated, ${counts.move} moved, ${counts.unchanged} already current, ${blocked} blocked ` +
              `(${importable.length} row(s) would be sent). Rolling back — nothing was written.`,
          );
          throw new DryRunRollback();
        });
      } catch (error) {
        if (!(error instanceof DryRunRollback)) throw error;
      }
      return;
    }

    const { importable, blocked } = await prepareAndPreview(db, context);
    if (importable.length === 0)
      throw new Error(
        "No importable rows — fix the reported problems and re-run.",
      );

    const outcome = await bulkImportVocabulary(db, {
      languageId: language.id,
      actorUserId: actor.id,
      idempotencyKey: stepKey(keyPrefix, "import"),
      rows: importable,
    });
    const {
      createdVocabularyItemIds,
      createdGrammarItemIds,
      updatedVocabularyItemIds,
      updatedGrammarItemIds,
    } = outcome;
    console.log(
      `Created ${createdVocabularyItemIds.length + createdGrammarItemIds.length} item(s) as Pending; ` +
        `updated ${updatedVocabularyItemIds.length + updatedGrammarItemIds.length} in place; moved ${outcome.movedItemIds.length}; ` +
        `${outcome.unchangedCount} already current; ${blocked + outcome.blocked.length} blocked.`,
    );
    if (outcome.draftedItemIds.length > 0) {
      console.log(
        `  ${outcome.draftedItemIds.length} published item(s) updated as a draft — publish them in Admin to make the change live.`,
      );
    }
    for (const blockedRow of outcome.blocked)
      console.warn(`  ! ${blockedRow.displayForm}: ${blockedRow.reason}`);

    const touchedVocabularyIds = [
      ...createdVocabularyItemIds,
      ...updatedVocabularyItemIds,
    ];
    if (touchedVocabularyIds.length > 0) {
      const matched = await matchImportedVocabularyItems(
        db,
        touchedVocabularyIds,
      );
      const summary = Object.entries(matched.byStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ");
      console.log(
        `Dictionary matching: ${matched.processed} processed${summary ? ` — ${summary}` : ""}. Ambiguous and unmatched words are in the Admin dictionary review queue.`,
      );
    }

    console.log(
      "Nothing was published. Review and publish from /admin/curriculum.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AdminError) {
    console.error(`Import failed (${error.code}): ${error.message}`);
  } else {
    console.error("Import failed:", error);
  }
  process.exitCode = 1;
});
