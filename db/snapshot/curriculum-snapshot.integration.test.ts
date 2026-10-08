import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "@neondatabase/serverless";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { assertSafeIntegrationDatabaseUrl } from "@/db/test/db-safety-guard";

import {
  exportCurriculumSnapshot,
  loadCurriculumSnapshot,
  type CurriculumSnapshot,
} from "./curriculum-snapshot";

/**
 * Real PostgreSQL, but every test runs inside a transaction that is always
 * rolled back, on a synthetic language that exists only inside that
 * transaction — so the shared TEST_DATABASE_URL branch is never changed.
 */

let pool: Pool;
let client: PoolClient;

beforeAll(() => {
  pool = new Pool({ connectionString: assertSafeIntegrationDatabaseUrl() });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
});

afterEach(async () => {
  await client.query("ROLLBACK");
  client.release();
});

type Synthetic = {
  code: string;
  languageId: string;
  levelId: string;
  vocabItemId: string;
  grammarItemId: string;
};

/** A published level plus decoys that must NOT be exported: a pending item in a draft theme, and a sentence linked only to it. */
async function seedSyntheticLevel(): Promise<Synthetic> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const code = `zz-${suffix}`;
  const languageId = randomUUID();
  const levelId = randomUUID();
  const groupA = randomUUID();
  const groupB = randomUUID();
  const groupDraft = randomUUID();
  const vocabItemId = randomUUID();
  const grammarItemId = randomUUID();
  const pendingItemId = randomUUID();
  const sentenceId = randomUUID();
  const decoySentenceId = randomUUID();

  const q = (text: string, values: unknown[] = []) =>
    client.query(text, values);

  await q(
    "insert into languages (id, code, slug, name) values ($1, $2, $3, $4)",
    [languageId, code, `slug-${suffix}`, `Synthetic ${suffix}`],
  );
  await q(
    "insert into levels (id, language_id, level_number, name, status) values ($1, $2, 1, 'Level 1', 'published')",
    [levelId, languageId],
  );
  for (const [id, name, position, status] of [
    [groupA, "Numbers", 1, "published"],
    [groupB, "Grammar", 2, "published"],
    [groupDraft, "Unfinished", 3, "draft"],
  ] as const) {
    await q(
      "insert into vocabulary_groups (id, level_id, language_id, name, position, status) values ($1, $2, $3, $4, $5, $6)",
      [id, levelId, languageId, name, position, status],
    );
  }
  for (const [id, type, status, position, group, term] of [
    [vocabItemId, "vocabulary", "published", 1, groupA, "uno"],
    [grammarItemId, "grammar", "published", 2, groupB, null],
    [pendingItemId, "vocabulary", "pending", 3, groupDraft, "dos"],
  ] as const) {
    await q(
      "insert into learning_items (id, language_id, level_id, type, status, position, lesson_priority) values ($1, $2, $3, $4, $5, $6, 0)",
      [id, languageId, levelId, type, status, position],
    );
    if (type === "vocabulary") {
      await q(
        "insert into vocabulary_items (learning_item_id, vocabulary_group_id, term, primary_meaning, part_of_speech) values ($1, $2, $3, 'one', 'noun')",
        [id, group, term],
      );
    } else {
      await q(
        "insert into grammar_items (learning_item_id, vocabulary_group_id, structure, primary_meaning, explanation) values ($1, $2, 'y = and', 'and', 'Joins words.')",
        [id, group],
      );
    }
  }
  for (const value of ["uno", "un"]) {
    await q(
      "insert into accepted_answers (learning_item_id, side, value, normalized_value) values ($1, 'term', $2, $2)",
      [vocabItemId, value],
    );
  }
  for (const position of [1, 2]) {
    await q(
      "insert into grammar_content_blocks (learning_item_id, type, position, body) values ($1, 'text', $2, 'Some text')",
      [grammarItemId, position],
    );
  }
  for (const [sentence, item] of [
    [sentenceId, vocabItemId],
    [decoySentenceId, pendingItemId],
  ] as const) {
    await q(
      "insert into sentences (id, language_id, target_text, translation) values ($1, $2, 'Uno.', 'One.')",
      [sentence, languageId],
    );
    await q(
      "insert into learning_item_sentences (learning_item_id, sentence_id, position) values ($1, $2, 1)",
      [item, sentence],
    );
  }

  return { code, languageId, levelId, vocabItemId, grammarItemId };
}

/** Deletes the synthetic level's whole chain (children first), optionally the language too. */
async function removeContent(languageId: string, alsoLanguage: boolean) {
  const items = "select id from learning_items where language_id = $1";
  for (const sql of [
    `delete from learning_item_sentences where learning_item_id in (${items})`,
    "delete from sentences where language_id = $1",
    `delete from accepted_answers where learning_item_id in (${items})`,
    `delete from grammar_content_blocks where learning_item_id in (${items})`,
    `delete from grammar_items where learning_item_id in (${items})`,
    `delete from vocabulary_items where learning_item_id in (${items})`,
    "delete from learning_items where language_id = $1",
    "delete from vocabulary_groups where language_id = $1",
    "delete from levels where language_id = $1",
  ]) {
    await client.query(sql, [languageId]);
  }
  if (alsoLanguage) {
    await client.query("delete from languages where id = $1", [languageId]);
  }
}

async function count(table: string, where: string, value: string) {
  const result = await client.query(
    `select count(*)::int as n from ${table} where ${where}`,
    [value],
  );
  return Number(result.rows[0].n);
}

async function exportSynthetic(code: string): Promise<CurriculumSnapshot> {
  return exportCurriculumSnapshot(client, {
    languageCode: code,
    levelNumber: 1,
  });
}

describe("curriculum snapshot (real PostgreSQL)", () => {
  it("exports only the published content of one level", async () => {
    const synthetic = await seedSyntheticLevel();

    const snapshot = await exportSynthetic(synthetic.code);

    expect(snapshot.language.code).toBe(synthetic.code);
    expect(snapshot.language.sourceId).toBe(synthetic.languageId);
    expect(snapshot.tables.levels).toHaveLength(1);
    // the draft theme and the pending item are left behind
    expect(snapshot.tables.vocabulary_groups).toHaveLength(2);
    expect(snapshot.tables.learning_items.map((r) => r.id).sort()).toEqual(
      [synthetic.vocabItemId, synthetic.grammarItemId].sort(),
    );
    expect(snapshot.tables.vocabulary_items).toHaveLength(1);
    expect(snapshot.tables.grammar_items).toHaveLength(1);
    expect(snapshot.tables.accepted_answers).toHaveLength(2);
    expect(snapshot.tables.grammar_content_blocks).toHaveLength(2);
    // the sentence linked only to the pending item is left behind
    expect(snapshot.tables.sentences).toHaveLength(1);
    expect(snapshot.tables.learning_item_sentences).toHaveLength(1);
  });

  it("round-trips into a database that has none of it, remapping the language id", async () => {
    const synthetic = await seedSyntheticLevel();
    const snapshot = await exportSynthetic(synthetic.code);
    await removeContent(synthetic.languageId, true);

    const result = await loadCurriculumSnapshot(client, snapshot);

    expect(result).toMatchObject({ status: "loaded" });
    const language = await client.query(
      "select id from languages where code = $1",
      [synthetic.code],
    );
    const newLanguageId = String(language.rows[0].id);
    expect(newLanguageId).not.toBe(synthetic.languageId);

    for (const table of [
      "levels",
      "vocabulary_groups",
      "learning_items",
      "sentences",
    ]) {
      expect(
        await count(table, "language_id = $1", newLanguageId),
      ).toBeGreaterThan(0);
      expect(await count(table, "language_id = $1", synthetic.languageId)).toBe(
        0,
      );
    }
    expect(
      await count("learning_items", "language_id = $1", newLanguageId),
    ).toBe(2);
    expect(
      await count(
        "accepted_answers",
        "learning_item_id = $1",
        synthetic.vocabItemId,
      ),
    ).toBe(2);
    expect(
      await count(
        "grammar_content_blocks",
        "learning_item_id = $1",
        synthetic.grammarItemId,
      ),
    ).toBe(2);

    // content and permanent keys survive exactly
    const restored = await client.query(
      "select li.curriculum_key, vi.term from learning_items li join vocabulary_items vi on vi.learning_item_id = li.id where li.id = $1",
      [synthetic.vocabItemId],
    );
    const original = snapshot.tables.learning_items.find(
      (r) => r.id === synthetic.vocabItemId,
    );
    expect(restored.rows[0].term).toBe("uno");
    expect(restored.rows[0].curriculum_key).toBe(original?.curriculum_key);
  });

  it("is a no-op when the same snapshot is loaded again", async () => {
    const synthetic = await seedSyntheticLevel();
    const snapshot = await exportSynthetic(synthetic.code);
    await removeContent(synthetic.languageId, true);

    await loadCurriculumSnapshot(client, snapshot);
    const again = await loadCurriculumSnapshot(client, snapshot);

    expect(again).toEqual({ status: "already-loaded" });
  });

  it("refuses a language that already has other curriculum", async () => {
    const synthetic = await seedSyntheticLevel();
    const snapshot = await exportSynthetic(synthetic.code);
    await removeContent(synthetic.languageId, false);
    await client.query(
      "insert into levels (language_id, level_number, status) values ($1, 2, 'draft')",
      [synthetic.languageId],
    );

    await expect(loadCurriculumSnapshot(client, snapshot)).rejects.toThrow(
      /already has \d+ curriculum row/,
    );
    expect(
      await count("levels", "language_id = $1", synthetic.languageId),
    ).toBe(1);
  });

  it("refuses a snapshot that is only partly present instead of merging", async () => {
    const synthetic = await seedSyntheticLevel();
    const snapshot = await exportSynthetic(synthetic.code);
    await removeContent(synthetic.languageId, true);
    await loadCurriculumSnapshot(client, snapshot);
    await client.query(
      "delete from accepted_answers where learning_item_id = $1 and value = 'un'",
      [synthetic.vocabItemId],
    );

    await expect(loadCurriculumSnapshot(client, snapshot)).rejects.toThrow(
      /only partly present/,
    );
  });

  it("refuses a target that is migrated less far than the snapshot's source", async () => {
    const synthetic = await seedSyntheticLevel();
    const snapshot = await exportSynthetic(synthetic.code);
    await removeContent(synthetic.languageId, true);
    snapshot.migrations.latestCreatedAt = "99999999999999999";

    await expect(loadCurriculumSnapshot(client, snapshot)).rejects.toThrow(
      /migrated less far/,
    );
    // it failed before touching anything, not even the language
    const language = await client.query(
      "select 1 from languages where code = $1",
      [synthetic.code],
    );
    expect(language.rows).toHaveLength(0);
  });

  it("refuses to load a snapshot that fails its integrity check", async () => {
    const synthetic = await seedSyntheticLevel();
    const snapshot = await exportSynthetic(synthetic.code);
    await removeContent(synthetic.languageId, true);
    snapshot.tables.vocabulary_groups = [];

    await expect(loadCurriculumSnapshot(client, snapshot)).rejects.toThrow(
      /invalid snapshot/,
    );
  });

  it("refuses to export a level whose items point at an unpublished theme", async () => {
    const synthetic = await seedSyntheticLevel();
    await client.query(
      "update vocabulary_groups set status = 'draft' where level_id = $1 and name = 'Numbers'",
      [synthetic.levelId],
    );

    await expect(exportSynthetic(synthetic.code)).rejects.toThrow(
      /cannot be snapshotted[\s\S]*not a published theme/,
    );
  });
});
