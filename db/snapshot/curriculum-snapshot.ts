import { z } from "zod";

/**
 * Curriculum snapshots: an exact, repeatable copy of ONE published level of
 * ONE language — the level, its themes, its published items with their
 * detail rows, accepted answers, grammar lesson blocks, sentences and the
 * sentence links — from one database into another.
 *
 * Why this exists: spec 23 calls for production to start from an empty
 * database and receive curriculum through the Admin import workflow, but
 * (a) the first user cannot be provisioned until the default language and
 * Level 1 exist, and (b) the canonical CSV export does not carry grammar
 * lesson blocks or sentences, so a CSV round trip cannot reproduce a level
 * that was authored and refined in Admin. A snapshot is the faithful route.
 * Using it for production is a deliberate owner decision that bypasses the
 * Admin review/publish step and its audit trail (see progress-tracker.md,
 * Open Questions); it is not a general sync mechanism.
 *
 * What it deliberately does NOT carry: anything user-linked (users,
 * progress, notes, decks, `mapped_by_user_id`/`selected_by_user_id` rows),
 * admin audit events, import bookkeeping, idempotency keys, dictionary data
 * (that needs its own `lexicon:import`), unpublished items/themes, and every
 * other level or language. `validateSnapshotIntegrity` additionally rejects
 * any row carrying a user-reference column, so a future schema change cannot
 * silently smuggle one in.
 *
 * Callers own transaction control: both functions take any object with a
 * `query` method (a Neon `Pool`, a `PoolClient`) and never BEGIN/COMMIT
 * themselves, so the CLI can offer a rolled-back dry run and tests can run
 * everything inside a transaction that is always rolled back.
 */

export const SNAPSHOT_FORMAT_VERSION = 1;

export type SnapshotRow = Record<string, unknown>;

export type SnapshotExecutor = {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};

type TableSpec = {
  table: string;
  /** Column that identifies a row (a single-column primary key in every table here). */
  idColumn: string;
  /** Rows of this table belonging to one level; `$1` is the level id. */
  where: string;
  orderBy: string;
  /** Columns holding the language id, rewritten to the target's id on load. */
  languageColumns: readonly string[];
};

const PUBLISHED_ITEM_IDS = `select id from learning_items where level_id = $1 and status = 'published'`;

/** Parents before children: this is both the export order and the insert order. */
const TABLE_SPECS = [
  {
    table: "levels",
    idColumn: "id",
    where: "id = $1",
    orderBy: "id",
    languageColumns: ["language_id"],
  },
  {
    table: "vocabulary_groups",
    idColumn: "id",
    where: "level_id = $1 and status = 'published'",
    orderBy: "position, id",
    languageColumns: ["language_id"],
  },
  {
    table: "learning_items",
    idColumn: "id",
    where: "level_id = $1 and status = 'published'",
    orderBy: "position, id",
    languageColumns: ["language_id"],
  },
  {
    table: "vocabulary_items",
    idColumn: "learning_item_id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id",
    languageColumns: [],
  },
  {
    table: "grammar_items",
    idColumn: "learning_item_id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id",
    languageColumns: [],
  },
  {
    table: "grammar_content_blocks",
    idColumn: "id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id, position, id",
    languageColumns: [],
  },
  {
    table: "accepted_answers",
    idColumn: "id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id, id",
    languageColumns: [],
  },
  {
    table: "vocabulary_usage_contexts",
    idColumn: "id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id, position, id",
    languageColumns: [],
  },
  {
    table: "learning_item_resources",
    idColumn: "id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id, position, id",
    languageColumns: [],
  },
  {
    table: "sentences",
    idColumn: "id",
    where: `id in (select sentence_id from learning_item_sentences where learning_item_id in (${PUBLISHED_ITEM_IDS}))`,
    orderBy: "id",
    languageColumns: ["language_id"],
  },
  {
    table: "learning_item_sentences",
    idColumn: "id",
    where: `learning_item_id in (${PUBLISHED_ITEM_IDS})`,
    orderBy: "learning_item_id, position, id",
    languageColumns: [],
  },
] as const satisfies readonly TableSpec[];

export type SnapshotTableName = (typeof TABLE_SPECS)[number]["table"];

export const SNAPSHOT_TABLE_NAMES: readonly SnapshotTableName[] =
  TABLE_SPECS.map((spec) => spec.table);

const rowSchema = z.record(z.string(), z.unknown());

const snapshotSchema = z.object({
  formatVersion: z.literal(SNAPSHOT_FORMAT_VERSION),
  exportedAt: z.string().min(1),
  /** Migration state of the source database when exported. */
  migrations: z.object({
    applied: z.number().int().nonnegative(),
    latestCreatedAt: z.string().min(1),
  }),
  language: z.object({
    code: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    /** The source database's id for this language; rewritten on load. */
    sourceId: z.string().min(1),
  }),
  levelNumber: z.number().int().min(1),
  tables: z.object(
    Object.fromEntries(
      SNAPSHOT_TABLE_NAMES.map((name) => [name, z.array(rowSchema)]),
    ),
  ),
});

export type CurriculumSnapshot = z.infer<typeof snapshotSchema>;

export function parseSnapshot(raw: unknown): CurriculumSnapshot {
  return snapshotSchema.parse(raw);
}

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(identifier)}`);
  }
  return `"${identifier}"`;
}

function rowsOf(snapshot: CurriculumSnapshot, table: SnapshotTableName) {
  return snapshot.tables[table] ?? [];
}

function idsOf(
  snapshot: CurriculumSnapshot,
  table: SnapshotTableName,
  idColumn: string,
): Set<string> {
  const ids = new Set<string>();
  for (const row of rowsOf(snapshot, table)) {
    const id = row[idColumn];
    if (typeof id === "string") ids.add(id);
  }
  return ids;
}

/** Column names that reference a user: these must never travel in a snapshot. */
const USER_REFERENCE_COLUMN = /(^|_)user_id$|_by$|^created_by$/;

/**
 * Pure referential-integrity and safety check, run on export (so a bad
 * snapshot is never written) and again on load (so a hand-edited or stale
 * file is never inserted). Returns every problem found; empty means valid.
 */
export function validateSnapshotIntegrity(
  snapshot: CurriculumSnapshot,
): string[] {
  const problems: string[] = [];

  const levelRows = rowsOf(snapshot, "levels");
  if (levelRows.length !== 1) {
    problems.push(`expected exactly 1 level row, found ${levelRows.length}`);
    return problems;
  }
  const level = levelRows[0];
  const levelId = level.id;
  if (level.level_number !== snapshot.levelNumber) {
    problems.push(
      `level row is Level ${String(level.level_number)} but the snapshot says Level ${snapshot.levelNumber}`,
    );
  }

  for (const spec of TABLE_SPECS) {
    const seen = new Set<string>();
    for (const row of rowsOf(snapshot, spec.table)) {
      const id = row[spec.idColumn];
      if (typeof id !== "string") {
        problems.push(`${spec.table}: a row has no ${spec.idColumn}`);
        continue;
      }
      if (seen.has(id)) problems.push(`${spec.table}: duplicate id ${id}`);
      seen.add(id);

      for (const column of Object.keys(row)) {
        if (USER_REFERENCE_COLUMN.test(column)) {
          problems.push(
            `${spec.table}: carries user-reference column "${column}", which must not be snapshotted`,
          );
        }
      }
      for (const column of spec.languageColumns) {
        if (row[column] !== snapshot.language.sourceId) {
          problems.push(
            `${spec.table} ${id}: ${column} is not the snapshot's language`,
          );
        }
      }
    }
  }

  const groupIds = idsOf(snapshot, "vocabulary_groups", "id");
  const itemIds = idsOf(snapshot, "learning_items", "id");
  const contextIds = idsOf(snapshot, "vocabulary_usage_contexts", "id");
  const sentenceIds = idsOf(snapshot, "sentences", "id");

  for (const group of rowsOf(snapshot, "vocabulary_groups")) {
    if (group.level_id !== levelId) {
      problems.push(`vocabulary_groups ${String(group.id)}: wrong level_id`);
    }
  }

  const vocabularyDetailIds = idsOf(
    snapshot,
    "vocabulary_items",
    "learning_item_id",
  );
  const grammarDetailIds = idsOf(snapshot, "grammar_items", "learning_item_id");

  for (const item of rowsOf(snapshot, "learning_items")) {
    const id = String(item.id);
    if (item.level_id !== levelId) {
      problems.push(`learning_items ${id}: wrong level_id`);
    }
    if (item.type === "vocabulary") {
      if (!vocabularyDetailIds.has(id)) {
        problems.push(
          `learning_items ${id}: vocabulary item has no vocabulary_items row`,
        );
      }
      if (grammarDetailIds.has(id)) {
        problems.push(
          `learning_items ${id}: vocabulary item also has a grammar_items row`,
        );
      }
    } else if (item.type === "grammar") {
      if (!grammarDetailIds.has(id)) {
        problems.push(
          `learning_items ${id}: grammar item has no grammar_items row`,
        );
      }
      if (vocabularyDetailIds.has(id)) {
        problems.push(
          `learning_items ${id}: grammar item also has a vocabulary_items row`,
        );
      }
    } else {
      problems.push(`learning_items ${id}: unknown type ${String(item.type)}`);
    }
  }

  for (const row of rowsOf(snapshot, "vocabulary_items")) {
    if (!itemIds.has(String(row.learning_item_id))) {
      problems.push(
        `vocabulary_items ${String(row.learning_item_id)}: no matching exported item`,
      );
    }
    if (!groupIds.has(String(row.vocabulary_group_id))) {
      problems.push(
        `vocabulary_items ${String(row.learning_item_id)}: its theme (vocabulary_group_id) is not a published theme of this level`,
      );
    }
  }
  for (const row of rowsOf(snapshot, "grammar_items")) {
    if (!itemIds.has(String(row.learning_item_id))) {
      problems.push(
        `grammar_items ${String(row.learning_item_id)}: no matching exported item`,
      );
    }
    if (
      row.vocabulary_group_id != null &&
      !groupIds.has(String(row.vocabulary_group_id))
    ) {
      problems.push(
        `grammar_items ${String(row.learning_item_id)}: its theme (vocabulary_group_id) is not a published theme of this level`,
      );
    }
  }

  const childTables: SnapshotTableName[] = [
    "grammar_content_blocks",
    "accepted_answers",
    "vocabulary_usage_contexts",
    "learning_item_resources",
    "learning_item_sentences",
  ];
  for (const table of childTables) {
    for (const row of rowsOf(snapshot, table)) {
      if (!itemIds.has(String(row.learning_item_id))) {
        problems.push(`${table} ${String(row.id)}: no matching exported item`);
      }
    }
  }
  for (const link of rowsOf(snapshot, "learning_item_sentences")) {
    if (!sentenceIds.has(String(link.sentence_id))) {
      problems.push(
        `learning_item_sentences ${String(link.id)}: sentence not exported`,
      );
    }
    if (
      link.usage_context_id != null &&
      !contextIds.has(String(link.usage_context_id))
    ) {
      problems.push(
        `learning_item_sentences ${String(link.id)}: usage context not exported`,
      );
    }
  }

  return problems;
}

/** One line per table, for logs and confirmation prompts. */
export function summarizeSnapshot(snapshot: CurriculumSnapshot): string[] {
  return SNAPSHOT_TABLE_NAMES.map(
    (table) => `${table}: ${rowsOf(snapshot, table).length}`,
  );
}

export type LoadDecision =
  | { action: "load" }
  | { action: "already-loaded" }
  | { action: "refuse"; reason: string };

/**
 * Pure decision about what to do with a target, from what a preflight found.
 * The loader only ever seeds a language that has no curriculum; the single
 * exception is a re-run of the exact same snapshot, which is a no-op.
 */
export function decideLoad(preflight: {
  /** Rows (levels, themes, items, sentences) the target already holds for this language. */
  existingContentRows: number;
  /** Whether the target already has the snapshot's level id. */
  hasSnapshotLevel: boolean;
  /** Per table: rows in the target with this snapshot's ids vs rows in the snapshot. */
  idMatches: Record<string, { found: number; expected: number }>;
}): LoadDecision {
  const allPresent = Object.values(preflight.idMatches).every(
    (match) => match.found === match.expected,
  );

  if (preflight.hasSnapshotLevel) {
    return allPresent
      ? { action: "already-loaded" }
      : {
          action: "refuse",
          reason:
            "this snapshot is only partly present in the target (some of its rows exist, some do not). Resolve that by hand rather than merging.",
        };
  }
  if (preflight.existingContentRows > 0) {
    return {
      action: "refuse",
      reason: `the target already has ${preflight.existingContentRows} curriculum row(s) for this language. This loader only seeds a language that has none.`,
    };
  }
  return { action: "load" };
}

export async function exportCurriculumSnapshot(
  executor: SnapshotExecutor,
  options: { languageCode: string; levelNumber: number; now?: Date },
): Promise<CurriculumSnapshot> {
  const language = (
    await executor.query(
      "select id, code, slug, name from languages where code = $1",
      [options.languageCode],
    )
  ).rows[0];
  if (!language) {
    throw new Error(`No language with code "${options.languageCode}".`);
  }

  const level = (
    await executor.query(
      "select id from levels where language_id = $1 and level_number = $2",
      [language.id, options.levelNumber],
    )
  ).rows[0];
  if (!level) {
    throw new Error(
      `No Level ${options.levelNumber} for language "${options.languageCode}".`,
    );
  }

  const tables: Record<string, SnapshotRow[]> = {};
  for (const spec of TABLE_SPECS) {
    const result = await executor.query(
      `select coalesce(jsonb_agg(to_jsonb(t) order by ${spec.orderBy}), '[]'::jsonb) as rows from ${quoteIdentifier(spec.table)} t where ${spec.where}`,
      [level.id],
    );
    const rows: unknown = result.rows[0]?.rows;
    tables[spec.table] = z.array(rowSchema).parse(rows);
  }

  const migrations = (
    await executor.query(
      "select count(*)::int as applied, coalesce(max(created_at), 0)::text as latest from drizzle.__drizzle_migrations",
    )
  ).rows[0];

  const snapshot = parseSnapshot({
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    migrations: {
      applied: Number(migrations?.applied ?? 0),
      latestCreatedAt: String(migrations?.latest ?? "0"),
    },
    language: {
      code: String(language.code),
      slug: String(language.slug),
      name: String(language.name),
      sourceId: String(language.id),
    },
    levelNumber: options.levelNumber,
    tables,
  });

  const problems = validateSnapshotIntegrity(snapshot);
  if (problems.length > 0) {
    throw new Error(
      `The level cannot be snapshotted:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  return snapshot;
}

export type LoadResult =
  | { status: "already-loaded" }
  | { status: "loaded"; counts: Record<string, number> };

export async function loadCurriculumSnapshot(
  executor: SnapshotExecutor,
  snapshot: CurriculumSnapshot,
  options: { log?: (message: string) => void } = {},
): Promise<LoadResult> {
  const log = options.log ?? (() => undefined);

  const problems = validateSnapshotIntegrity(snapshot);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to load an invalid snapshot:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }

  // The target must already be migrated at least as far as the source was.
  const target = (
    await executor.query(
      "select count(*)::int as applied, coalesce(max(created_at), 0)::text as latest from drizzle.__drizzle_migrations",
    )
  ).rows[0];
  const targetLatest = BigInt(String(target?.latest ?? "0"));
  const sourceLatest = BigInt(snapshot.migrations.latestCreatedAt);
  if (targetLatest < sourceLatest) {
    throw new Error(
      "The target database is migrated less far than the snapshot's source. Run `npm run db:migrate` against it first.",
    );
  }
  if (targetLatest > sourceLatest) {
    log(
      "Note: the target is migrated further than the snapshot's source; inserts will fail loudly if a column no longer matches.",
    );
  }

  // Resolve (or create) the language by code; ids are rewritten to the target's.
  const existingLanguage = (
    await executor.query("select id from languages where code = $1", [
      snapshot.language.code,
    ])
  ).rows[0];
  let targetLanguageId: string;
  if (existingLanguage) {
    targetLanguageId = String(existingLanguage.id);
  } else {
    const created = (
      await executor.query(
        "insert into languages (code, slug, name) values ($1, $2, $3) returning id",
        [
          snapshot.language.code,
          snapshot.language.slug,
          snapshot.language.name,
        ],
      )
    ).rows[0];
    targetLanguageId = String(created?.id);
    log(`Created language ${snapshot.language.code}`);
  }

  const levelRow = rowsOf(snapshot, "levels")[0];
  const hasSnapshotLevel =
    (await executor.query("select 1 from levels where id = $1", [levelRow.id]))
      .rows.length > 0;

  const contentCounts = await executor.query(
    `select
       (select count(*) from levels where language_id = $1)
       + (select count(*) from vocabulary_groups where language_id = $1)
       + (select count(*) from learning_items where language_id = $1)
       + (select count(*) from sentences where language_id = $1) as total`,
    [targetLanguageId],
  );
  const idMatches: Record<string, { found: number; expected: number }> = {};
  for (const spec of TABLE_SPECS) {
    const ids = [...idsOf(snapshot, spec.table, spec.idColumn)];
    const found = await executor.query(
      `select count(*)::int as n from ${quoteIdentifier(spec.table)} where ${quoteIdentifier(spec.idColumn)} = any($1::uuid[])`,
      [ids],
    );
    idMatches[spec.table] = {
      found: Number(found.rows[0]?.n ?? 0),
      expected: ids.length,
    };
  }

  const decision = decideLoad({
    existingContentRows: Number(contentCounts.rows[0]?.total ?? 0),
    hasSnapshotLevel,
    idMatches,
  });
  if (decision.action === "already-loaded") return { status: "already-loaded" };
  if (decision.action === "refuse") {
    throw new Error(`Refusing to load: ${decision.reason}`);
  }

  const counts: Record<string, number> = {};
  for (const spec of TABLE_SPECS) {
    const rows = rowsOf(snapshot, spec.table).map((row) => {
      const copy: SnapshotRow = { ...row };
      for (const column of spec.languageColumns) {
        if (copy[column] === snapshot.language.sourceId) {
          copy[column] = targetLanguageId;
        }
      }
      return copy;
    });
    counts[spec.table] = rows.length;
    if (rows.length === 0) continue;

    // Only the columns the snapshot carries are listed, so a column added to
    // the target later falls back to its own default instead of NULL.
    const columns = Object.keys(rows[0]).map(quoteIdentifier).join(", ");
    const table = quoteIdentifier(spec.table);
    await executor.query(
      `insert into ${table} (${columns}) select ${columns} from jsonb_populate_recordset(null::${table}, $1::jsonb)`,
      [JSON.stringify(rows)],
    );
    log(`Inserted ${rows.length} into ${spec.table}`);
  }

  // Prove every row landed before the caller commits.
  for (const spec of TABLE_SPECS) {
    const ids = [...idsOf(snapshot, spec.table, spec.idColumn)];
    const found = await executor.query(
      `select count(*)::int as n from ${quoteIdentifier(spec.table)} where ${quoteIdentifier(spec.idColumn)} = any($1::uuid[])`,
      [ids],
    );
    if (Number(found.rows[0]?.n ?? 0) !== ids.length) {
      throw new Error(
        `Verification failed for ${spec.table}: expected ${ids.length} rows, found ${String(found.rows[0]?.n)}.`,
      );
    }
  }

  return { status: "loaded", counts };
}
