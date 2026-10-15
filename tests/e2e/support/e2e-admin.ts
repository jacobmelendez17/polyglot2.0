import { and, asc, count, desc, eq, inArray, like, sql } from "drizzle-orm";

import {
  adminAuditEvents,
  curriculumImportRows,
  curriculumImports,
  curriculumItemDrafts,
  deckItems,
  decks,
  dictionaryEntries,
  grammarItems,
  languages,
  learningItems,
  lexicalSources,
  levels,
  userItemProgress,
  userLanguageSettings,
  userLevelProgress,
  users,
  vocabularyDictionaryMappings,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { getAuditEvents } from "@/domains/admin/audit-repository";
import type { AdminAuditAction } from "@/domains/admin/audit-types";
import {
  createItem,
  createLevel,
  createVocabularyGroup,
  publishItem,
  updateItem,
  updateLevel,
  updateVocabularyGroup,
} from "@/domains/admin/publication-service";
import type { UserRole } from "@/domains/users";

import { withE2EDb } from "./e2e-db";

/**
 * Spec 26 — direct-DB helpers for the Admin console's role-matrix E2E specs.
 *
 * There is exactly one permanent, non-production Clerk identity with Admin
 * access (`Polyglot E2E Admin`, spec 22), and no committed writer or
 * developer identity. Rather than mint more real Clerk accounts, a spec flips
 * that identity's *database* role on the isolated E2E branch — which is the
 * authoritative source for every server-side check anyway (architecture.md
 * "Roles") — and always restores it. `withE2EDb` refuses to run against
 * anything but the guarded `E2E_DATABASE_URL`.
 */

function adminClerkUserId(): string {
  const value = process.env.E2E_ADMIN_CLERK_USER_ID;
  if (!value)
    throw new Error(
      "E2E_ADMIN_CLERK_USER_ID is required. Set it in .env.local — see .env.example.",
    );
  return value;
}

/** Sets the E2E admin identity's database role. Takes effect on its very next server request. */
export async function setE2EAdminRole(role: UserRole): Promise<void> {
  await withE2EDb(async (db) => {
    const updated = await db
      .update(users)
      .set({ role })
      .where(eq(users.clerkUserId, adminClerkUserId()))
      .returning({ id: users.id });
    if (updated.length !== 1)
      throw new Error(
        "No E2E admin row found — run `npm run e2e:setup` first.",
      );
  });
}

export type StatusCounts = {
  published: number;
  pending: number;
  draft: number;
  archived: number;
};

/**
 * Per-status learning-item counts for the E2E admin's own active language,
 * computed with an independent query — so a spec can compare what the UI
 * shows against the database rather than against the code under test.
 */
export async function getE2EAdminStatusCounts(): Promise<StatusCounts> {
  return withE2EDb(async (db) => {
    const [admin] = await db
      .select({ activeLanguageId: users.activeLanguageId })
      .from(users)
      .where(eq(users.clerkUserId, adminClerkUserId()))
      .limit(1);
    if (!admin)
      throw new Error(
        "No E2E admin row found — run `npm run e2e:setup` first.",
      );

    const rows = await db
      .select({
        status: learningItems.status,
        count: sql<number>`count(*)::int`,
      })
      .from(learningItems)
      .where(eq(learningItems.languageId, admin.activeLanguageId))
      .groupBy(learningItems.status);

    const counts: StatusCounts = {
      published: 0,
      pending: 0,
      draft: 0,
      archived: 0,
    };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  });
}

/* -------------------------------------------------------------------------- */
/* Throwaway curriculum fixtures for the Admin list (spec 26 Unit 2)          */
/* -------------------------------------------------------------------------- */

async function adminScope(
  db: Parameters<Parameters<typeof withE2EDb>[0]>[0],
): Promise<{ languageId: string; levelId: string; groupId: string }> {
  const [admin] = await db
    .select({ languageId: users.activeLanguageId })
    .from(users)
    .where(eq(users.clerkUserId, adminClerkUserId()))
    .limit(1);
  if (!admin)
    throw new Error("No E2E admin row found — run `npm run e2e:setup` first.");

  const [level] = await db
    .select({ id: levels.id })
    .from(levels)
    .where(eq(levels.languageId, admin.languageId))
    .orderBy(levels.levelNumber)
    .limit(1);
  const [group] = await db
    .select({ id: vocabularyGroups.id })
    .from(vocabularyGroups)
    .where(eq(vocabularyGroups.languageId, admin.languageId))
    .orderBy(vocabularyGroups.position)
    .limit(1);
  if (!level || !group)
    throw new Error(
      "The E2E database has no level/group — run `npm run e2e:setup`.",
    );
  return { languageId: admin.languageId, levelId: level.id, groupId: group.id };
}

/**
 * Inserts vocabulary items (published unless `status` says otherwise) into the E2E admin's own language and
 * first level, after everything already there: positions continue from the
 * highest in use (and never below 1000, which no seed uses), so a spec can
 * call this more than once — `(level, type, position)` is unique. Returns the
 * new ids so a spec can remove exactly what it added.
 *
 * Throwaway by design: each spec seeds what it needs and removes it in
 * `afterAll`, so no other spec sees extra curriculum.
 */
export async function seedExtraVocabulary(
  terms: string[],
  meaningPrefix = "meaning of",
  status: "published" | "pending" = "published",
): Promise<string[]> {
  return withE2EDb(async (db) => {
    const { languageId, levelId, groupId } = await adminScope(db);
    const ids = terms.map(() => crypto.randomUUID());
    await db.transaction(async (tx) => {
      const [highest] = await tx
        .select({
          position: sql<number>`coalesce(max(${learningItems.position}), 0)::int`,
        })
        .from(learningItems)
        .where(
          and(
            eq(learningItems.levelId, levelId),
            eq(learningItems.type, "vocabulary"),
          ),
        );
      const first = Math.max(1000, (highest?.position ?? 0) + 1);
      await tx.insert(learningItems).values(
        ids.map((id, index) => ({
          id,
          languageId,
          levelId,
          type: "vocabulary" as const,
          status,
          position: first + index,
          lessonPriority: first + index,
        })),
      );
      await tx.insert(vocabularyItems).values(
        ids.map((id, index) => ({
          learningItemId: id,
          vocabularyGroupId: groupId,
          term: terms[index]!,
          primaryMeaning: `${meaningPrefix} ${terms[index]!}`,
          partOfSpeech: "noun" as const,
        })),
      );
    });
    return ids;
  });
}

/** Removes items added by `seedExtraVocabulary`, and anything that referenced them. */
export async function removeSeededItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db.transaction(async (tx) => {
      await tx
        .delete(vocabularyItems)
        .where(inArray(vocabularyItems.learningItemId, ids));
      await tx.delete(learningItems).where(inArray(learningItems.id, ids));
    });
  });
}

export type OtherLanguageFixture = {
  languageId: string;
  levelId: string;
  groupId: string;
  itemId: string;
  remove: () => Promise<void>;
};

/**
 * A second language with its own level and one item, for proving that the
 * list never mixes languages: a level id from the *first* language must be
 * refused under the *second*, and the second's items must never show up in the
 * first's list.
 */
export async function seedOtherLanguage(
  term: string,
): Promise<OtherLanguageFixture> {
  const unique = crypto.randomUUID().slice(0, 8);
  return withE2EDb(async (db) => {
    const itemId = crypto.randomUUID();
    const [language] = await db
      .insert(languages)
      .values({
        code: `e2e-${unique}`,
        slug: `e2e-${unique}`,
        name: `E2E Other ${unique}`,
      })
      .returning({ id: languages.id });
    const [level] = await db
      .insert(levels)
      .values({
        languageId: language!.id,
        levelNumber: 1,
        name: "Other level",
        status: "published",
      })
      .returning({ id: levels.id });
    const [group] = await db
      .insert(vocabularyGroups)
      .values({
        languageId: language!.id,
        levelId: level!.id,
        name: "Other group",
        position: 1,
        status: "published",
      })
      .returning({ id: vocabularyGroups.id });
    await db.insert(learningItems).values({
      id: itemId,
      languageId: language!.id,
      levelId: level!.id,
      type: "vocabulary",
      status: "published",
      position: 1,
      lessonPriority: 1,
    });
    await db.insert(vocabularyItems).values({
      learningItemId: itemId,
      vocabularyGroupId: group!.id,
      term,
      primaryMeaning: `other ${term}`,
      partOfSpeech: "noun",
    });

    return {
      languageId: language!.id,
      levelId: level!.id,
      groupId: group!.id,
      itemId,
      remove: async () => {
        await withE2EDb(async (cleanup) => {
          await cleanup
            .delete(vocabularyItems)
            .where(eq(vocabularyItems.learningItemId, itemId));
          await cleanup
            .delete(learningItems)
            .where(eq(learningItems.id, itemId));
          // Children before parents: the group references the level.
          await cleanup
            .delete(vocabularyGroups)
            .where(eq(vocabularyGroups.id, group!.id));
          await cleanup.delete(levels).where(eq(levels.id, level!.id));
          await cleanup.delete(languages).where(eq(languages.id, language!.id));
        });
      },
    };
  });
}

/** The E2E admin's active language/level ids, for building API URLs in a spec. */
export async function getE2EAdminScope(): Promise<{
  languageId: string;
  levelId: string;
  groupId: string;
}> {
  return withE2EDb((db) => adminScope(db));
}

/* -------------------------------------------------------------------------- */
/* Review-queue fixtures (spec 26 Unit 3)                                     */
/* -------------------------------------------------------------------------- */

/**
 * The review queue is "pending items" plus "published items with an open
 * draft". These helpers build both through the *real* domain services — the
 * same `createItem` / `updateItem` / `publishItem` the Admin console calls —
 * run against the guarded E2E connection (they take a database handle and
 * touch nothing else), so a fixture is exactly what an author's own actions
 * would have left behind, never a hand-built row that merely looks like one.
 */

/** The permanent E2E admin's `users.id`: the author of seeded drafts and the actor of seeded publications. */
export async function getE2EAdminUserId(): Promise<string> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, adminClerkUserId()))
      .limit(1);
    if (!row)
      throw new Error(
        "No E2E admin row found — run `npm run e2e:setup` first.",
      );
    return row.id;
  });
}

function vocabularyFields(
  vocabularyGroupId: string,
  term: string,
  primaryMeaning: string,
) {
  return {
    vocabularyGroupId,
    term,
    primaryMeaning,
    partOfSpeech: "noun",
    acceptedAnswers: [],
  };
}

/**
 * A brand-new item awaiting review — what "Add item" leaves behind: status
 * `pending`, version 1, no draft. Remove it with `removeSeededItems`.
 */
export async function seedPendingItem(
  term: string,
  primaryMeaning: string,
): Promise<string> {
  const actorUserId = await getE2EAdminUserId();
  return withE2EDb(async (db) => {
    const { languageId, levelId, groupId } = await adminScope(db);
    const { learningItemId } = await createItem(db, {
      languageId,
      levelId,
      actorUserId,
      idempotencyKey: crypto.randomUUID(),
      type: "vocabulary",
      fields: vocabularyFields(groupId, term, primaryMeaning),
    });
    return learningItemId;
  });
}

/**
 * A published item that also carries an unpublished edit — what saving a live
 * item leaves behind. Learners keep seeing `liveMeaning` until the draft is
 * published. Remove it with `removeSeededItems` (the draft goes with it).
 */
export async function seedItemWithDraft(
  term: string,
  draftMeaning: string,
  liveMeaningPrefix = "live meaning of",
): Promise<{ id: string; liveMeaning: string }> {
  const [id] = await seedExtraVocabulary([term], liveMeaningPrefix);
  const actorUserId = await getE2EAdminUserId();
  await withE2EDb(async (db) => {
    const { groupId } = await adminScope(db);
    const { savedAsDraft } = await updateItem(db, {
      learningItemId: id!,
      actorUserId,
      idempotencyKey: crypto.randomUUID(),
      type: "vocabulary",
      fields: vocabularyFields(groupId, term, draftMeaning),
    });
    if (!savedAsDraft)
      throw new Error("The edit to a published item was not saved as a draft.");
  });
  return { id: id!, liveMeaning: `${liveMeaningPrefix} ${term}` };
}

/**
 * Publishes an item through the real service while a browser still shows it as
 * waiting — the "somebody else got there first" half of the stale-version
 * scenario. The version bump this causes is what makes the browser's copy stale.
 */
export async function publishBehindTheirBack(
  learningItemId: string,
  expectedVersion: number,
): Promise<void> {
  const actorUserId = await getE2EAdminUserId();
  await withE2EDb((db) =>
    publishItem(db, {
      learningItemId,
      expectedVersion,
      actorUserId,
      idempotencyKey: crypto.randomUUID(),
    }),
  );
}

export type E2EItemState = {
  status: "draft" | "pending" | "published" | "archived";
  version: number;
  term: string | null;
  primaryMeaning: string | null;
  hasDraft: boolean;
};

/** An item as the database holds it, read independently of the code under test; `null` once it is gone. */
export async function getE2EItemState(
  learningItemId: string,
): Promise<E2EItemState | null> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select({
        status: learningItems.status,
        version: learningItems.version,
        term: vocabularyItems.term,
        primaryMeaning: vocabularyItems.primaryMeaning,
        draftId: curriculumItemDrafts.id,
      })
      .from(learningItems)
      .leftJoin(
        vocabularyItems,
        eq(vocabularyItems.learningItemId, learningItems.id),
      )
      .leftJoin(
        curriculumItemDrafts,
        eq(curriculumItemDrafts.learningItemId, learningItems.id),
      )
      .where(eq(learningItems.id, learningItemId))
      .limit(1);
    if (!row) return null;
    return {
      status: row.status,
      version: row.version,
      term: row.term,
      primaryMeaning: row.primaryMeaning,
      hasDraft: row.draftId !== null,
    };
  });
}

/** How many "published" audit events exist for an item — one per real publication, never per click. */
export async function countE2EPublishAudits(
  resourceId: string,
): Promise<number> {
  return withE2EDb(async (db) => {
    const page = await getAuditEvents(db, {
      action: "CURRICULUM_ITEM_PUBLISHED",
      resourceId,
      limit: 50,
    });
    return page.items.length;
  });
}

/* -------------------------------------------------------------------------- */
/* Level fixtures (spec 26 Unit 4)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Throwaway levels in the E2E admin's own language, built through the *real*
 * `createLevel` / `updateLevel` services (they take a database handle and touch
 * nothing else) — so a fixture is exactly what an Admin's own actions would
 * have left behind. Only empty levels are ever created here, so removing one is
 * a plain delete.
 */

type LevelStatus = "draft" | "pending" | "published" | "archived";
type CefrBand = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type E2ELevel = {
  id: string;
  levelNumber: number;
  name: string | null;
  status: LevelStatus;
  cefrLevel: CefrBand | null;
};

const levelColumns = {
  id: levels.id,
  levelNumber: levels.levelNumber,
  name: levels.name,
  status: levels.status,
  cefrLevel: levels.cefrLevel,
};

/** The first level number in `[from, to]` the language does not use — a name taken by a crashed earlier run is skipped, not collided with. */
async function freeLevelNumber(
  db: Parameters<Parameters<typeof withE2EDb>[0]>[0],
  languageId: string,
  from: number,
  to: number,
): Promise<number> {
  const used = new Set(
    (
      await db
        .select({ levelNumber: levels.levelNumber })
        .from(levels)
        .where(eq(levels.languageId, languageId))
    ).map((row) => row.levelNumber),
  );
  for (let candidate = from; candidate <= to; candidate++) {
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`No free level number between ${from} and ${to}.`);
}

/**
 * An empty level. By default the number is the first free one from 700 up —
 * far above anything seeded; pass `from`/`to` to stay inside the learner-facing
 * range (1-50) when a spec needs a learner to open the level's page.
 */
export async function seedLevel(
  options: {
    from?: number;
    to?: number;
    name?: string | null;
    status?: LevelStatus;
    cefrLevel?: CefrBand | null;
  } = {},
): Promise<E2ELevel> {
  const actorUserId = await getE2EAdminUserId();
  return withE2EDb(async (db) => {
    const { languageId } = await adminScope(db);
    const levelNumber = await freeLevelNumber(
      db,
      languageId,
      options.from ?? 700,
      options.to ?? 899,
    );
    const { levelId } = await createLevel(db, {
      languageId,
      levelNumber,
      name: options.name ?? null,
      actorUserId,
      idempotencyKey: crypto.randomUUID(),
    });
    if (options.status !== undefined || options.cefrLevel !== undefined) {
      await updateLevel(db, {
        levelId,
        status: options.status,
        cefrLevel: options.cefrLevel,
        actorUserId,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    const [row] = await db
      .select(levelColumns)
      .from(levels)
      .where(eq(levels.id, levelId))
      .limit(1);
    return row!;
  });
}

/** A level as the database holds it, read independently of the code under test; `null` once it is gone. */
export async function getE2ELevel(levelId: string): Promise<E2ELevel | null> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select(levelColumns)
      .from(levels)
      .where(eq(levels.id, levelId))
      .limit(1);
    return row ?? null;
  });
}

/** A level of the E2E admin's language by its number — how a spec finds one the UI just created. */
export async function findE2ELevelByNumber(
  levelNumber: number,
): Promise<E2ELevel | null> {
  return withE2EDb(async (db) => {
    const { languageId } = await adminScope(db);
    const [row] = await db
      .select(levelColumns)
      .from(levels)
      .where(
        and(
          eq(levels.languageId, languageId),
          eq(levels.levelNumber, levelNumber),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

/** Every level of the E2E admin's language, by number — the ground truth for a list. */
export async function getE2ELevels(): Promise<E2ELevel[]> {
  return withE2EDb(async (db) => {
    const { languageId } = await adminScope(db);
    return db
      .select(levelColumns)
      .from(levels)
      .where(eq(levels.languageId, languageId))
      .orderBy(levels.levelNumber);
  });
}

/**
 * What a level holds, counted with queries of this file's own — never the
 * application's `getLevelContentCounts`, so a screen's numbers are checked
 * against something that does not share their bugs.
 */
export async function getE2ELevelCounts(levelId: string): Promise<{
  vocabularyItems: number;
  grammarItems: number;
  vocabularyGroups: number;
}> {
  return withE2EDb(async (db) => {
    const items = await db
      .select({ type: learningItems.type, n: count() })
      .from(learningItems)
      .where(eq(learningItems.levelId, levelId))
      .groupBy(learningItems.type);
    const [groups] = await db
      .select({ n: count() })
      .from(vocabularyGroups)
      .where(eq(vocabularyGroups.levelId, levelId));
    return {
      vocabularyItems: items.find((row) => row.type === "vocabulary")?.n ?? 0,
      grammarItems: items.find((row) => row.type === "grammar")?.n ?? 0,
      vocabularyGroups: groups?.n ?? 0,
    };
  });
}

/** How many audit events of `action` exist for a level — one per real change, never per click. */
export async function countE2ELevelAudits(
  action: "LEVEL_CREATED" | "LEVEL_UPDATED",
  levelId: string,
): Promise<number> {
  return withE2EDb(async (db) => {
    const page = await getAuditEvents(db, {
      action,
      resourceId: levelId,
      limit: 50,
    });
    return page.items.length;
  });
}

/** Removes levels this module (or the UI, under test) created. They must be empty. */
export async function removeSeededLevels(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db.delete(levels).where(inArray(levels.id, ids));
  });
}

/**
 * `howMany` empty draft levels in one statement, numbered from `from` — for a
 * spec that needs more levels than the list's bound without paying for each
 * one's audit trail. Returns their ids.
 */
export async function seedManyLevels(
  howMany: number,
  from: number,
): Promise<string[]> {
  return withE2EDb(async (db) => {
    const { languageId } = await adminScope(db);
    const rows = await db
      .insert(levels)
      .values(
        Array.from({ length: howMany }, (_, index) => ({
          languageId,
          levelNumber: from + index,
          status: "draft" as const,
        })),
      )
      .returning({ id: levels.id });
    return rows.map((row) => row.id);
  });
}

export type EmptyLanguageFixture = {
  languageId: string;
  remove: () => Promise<void>;
};

/**
 * A second language with no levels at all — for the empty state, and for proving
 * a list never mixes languages. (`seedOtherLanguage` gives its language a level
 * and an item, which is the opposite.) While it exists the Admin screens offer a
 * language switch.
 */
export async function seedEmptyLanguage(): Promise<EmptyLanguageFixture> {
  const unique = crypto.randomUUID().slice(0, 8);
  return withE2EDb(async (db) => {
    const [language] = await db
      .insert(languages)
      .values({
        code: `e2e-${unique}`,
        slug: `e2e-${unique}`,
        name: `E2E Empty ${unique}`,
      })
      .returning({ id: languages.id });
    return {
      languageId: language!.id,
      remove: async () => {
        await withE2EDb(async (cleanup) => {
          await cleanup.delete(languages).where(eq(languages.id, language!.id));
        });
      },
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Group fixtures (spec 26 Unit 5)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Throwaway vocabulary groups, built through the *real* `createVocabularyGroup`
 * / `updateVocabularyGroup` services — so a fixture is exactly what an Admin's
 * own actions would have left behind, and gets the position the application
 * itself gives it (the next one in its level). Only empty groups are ever
 * created here, so removing one is a plain delete — and a spec removes its
 * groups *before* the throwaway levels that hold them.
 */

export type E2EGroup = {
  id: string;
  levelId: string;
  languageId: string;
  name: string;
  status: LevelStatus;
  position: number;
};

const groupColumns = {
  id: vocabularyGroups.id,
  levelId: vocabularyGroups.levelId,
  languageId: vocabularyGroups.languageId,
  name: vocabularyGroups.name,
  status: vocabularyGroups.status,
  position: vocabularyGroups.position,
};

/** A group appended to `levelId` (after whatever it already holds), in the status given — draft by default, as the app creates it. */
export async function seedGroup(
  levelId: string,
  options: { name: string; status?: LevelStatus },
): Promise<E2EGroup> {
  const actorUserId = await getE2EAdminUserId();
  return withE2EDb(async (db) => {
    const [level] = await db
      .select({ languageId: levels.languageId })
      .from(levels)
      .where(eq(levels.id, levelId))
      .limit(1);
    if (!level) throw new Error(`No level ${levelId} to put a group in.`);
    const { groupId } = await createVocabularyGroup(db, {
      levelId,
      languageId: level.languageId,
      name: options.name,
      actorUserId,
      idempotencyKey: crypto.randomUUID(),
    });
    if (options.status !== undefined && options.status !== "draft") {
      await updateVocabularyGroup(db, {
        groupId,
        status: options.status,
        actorUserId,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    const [row] = await db
      .select(groupColumns)
      .from(vocabularyGroups)
      .where(eq(vocabularyGroups.id, groupId))
      .limit(1);
    return row!;
  });
}

/** A group as the database holds it, read independently of the code under test; `null` once it is gone. */
export async function getE2EGroup(groupId: string): Promise<E2EGroup | null> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select(groupColumns)
      .from(vocabularyGroups)
      .where(eq(vocabularyGroups.id, groupId))
      .limit(1);
    return row ?? null;
  });
}

/** Every group of a level, by position — the ground truth for a list, and for "nothing else moved". */
export async function getE2EGroupsOfLevel(
  levelId: string,
): Promise<E2EGroup[]> {
  return withE2EDb(async (db) =>
    db
      .select(groupColumns)
      .from(vocabularyGroups)
      .where(eq(vocabularyGroups.levelId, levelId))
      .orderBy(vocabularyGroups.position),
  );
}

/** A level's groups as `[name, position]` pairs, by position — what a spec compares before and after to prove nothing else moved. */
export async function snapshotE2EGroups(
  levelId: string,
): Promise<[string, number][]> {
  return (await getE2EGroupsOfLevel(levelId)).map((group) => [
    group.name,
    group.position,
  ]);
}

/** How many audit events of `action` exist for a resource — one per real change, never per click. */
export async function countE2EGroupAudits(
  action:
    "GROUP_CREATED" | "GROUP_UPDATED" | "GROUP_ARCHIVED" | "GROUP_REORDERED",
  resourceId: string,
): Promise<number> {
  return withE2EDb(async (db) => {
    const page = await getAuditEvents(db, {
      action,
      resourceId,
      limit: 50,
    });
    return page.items.length;
  });
}

/** Removes groups this module (or the UI, under test) created. They must be empty. */
export async function removeSeededGroups(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db.delete(vocabularyGroups).where(inArray(vocabularyGroups.id, ids));
  });
}

/**
 * `howMany` empty draft groups in one statement, in `levelId` and numbered
 * from 1 — for a spec that needs more groups than the list's bound without
 * paying for each one's audit trail. The level must be empty of groups.
 */
export async function seedManyGroups(
  levelId: string,
  howMany: number,
): Promise<string[]> {
  return withE2EDb(async (db) => {
    const [level] = await db
      .select({ languageId: levels.languageId })
      .from(levels)
      .where(eq(levels.id, levelId))
      .limit(1);
    if (!level) throw new Error(`No level ${levelId} to put groups in.`);
    const rows = await db
      .insert(vocabularyGroups)
      .values(
        Array.from({ length: howMany }, (_, index) => ({
          levelId,
          languageId: level.languageId,
          name: `Bulk group ${index + 1}`,
          position: index + 1,
          status: "draft" as const,
        })),
      )
      .returning({ id: vocabularyGroups.id });
    return rows.map((row) => row.id);
  });
}

/* -------------------------------------------------------------------------- */
/* User fixtures (spec 26 Unit 6)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Throwaway accounts in the isolated E2E database, for the Users console. They
 * have a *fake* Clerk id (the database never checks one against Clerk) — they
 * can be listed and given a role, but nobody can sign in as them, which is
 * exactly what a test of role management wants: the Admin's own view of a
 * person, with no real identity to disturb.
 *
 * Also the awkward cases the console must refuse: a **sandbox persona** (a user
 * row with no sign-in, owned by someone) and an **unlinked** row (no Clerk
 * identity, not a persona). Neither is ever listed, and neither may be a target.
 */

export type E2EUser = {
  id: string;
  role: UserRole;
  displayName: string | null;
  username: string | null;
  clerkLinked: boolean;
  isSandbox: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const userColumns = {
  id: users.id,
  role: users.role,
  displayName: users.displayName,
  username: users.username,
  clerkUserId: users.clerkUserId,
  isSandbox: users.isSandbox,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function toE2EUser(row: {
  id: string;
  role: UserRole;
  displayName: string | null;
  username: string | null;
  clerkUserId: string | null;
  isSandbox: boolean;
  createdAt: Date;
  updatedAt: Date;
}): E2EUser {
  return {
    id: row.id,
    role: row.role,
    displayName: row.displayName,
    username: row.username,
    clerkLinked: row.clerkUserId !== null,
    isSandbox: row.isSandbox,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One account. Real and Clerk-linked by default; `sandbox` makes a persona, `clerkLinked: false` an unlinked row. */
export async function seedUser(
  options: {
    displayName?: string | null;
    username?: string | null;
    role?: UserRole;
    clerkLinked?: boolean;
    sandbox?: boolean;
    createdAt?: Date;
  } = {},
): Promise<E2EUser> {
  const ownerId = await getE2EAdminUserId();
  return withE2EDb(async (db) => {
    const { languageId } = await adminScope(db);
    const sandbox = options.sandbox ?? false;
    const [row] = await db
      .insert(users)
      .values({
        clerkUserId:
          sandbox || options.clerkLinked === false
            ? null
            : `e2e-fixture-${crypto.randomUUID()}`,
        role: options.role ?? "user",
        displayName: options.displayName ?? null,
        username: options.username ?? null,
        activeLanguageId: languageId,
        isSandbox: sandbox,
        sandboxOwnerUserId: sandbox ? ownerId : null,
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      })
      .returning(userColumns);
    return toE2EUser(row!);
  });
}

/**
 * `howMany` real accounts in one statement, named `<tag> #1` … `<tag> #n`,
 * created one second apart with #1 the newest — for a spec that needs more
 * accounts than a page holds without paying a round trip for each.
 */
export async function seedManyUsers(
  tag: string,
  howMany: number,
): Promise<string[]> {
  return withE2EDb(async (db) => {
    const { languageId } = await adminScope(db);
    const base = Date.now() - 60_000;
    const rows = await db
      .insert(users)
      .values(
        Array.from({ length: howMany }, (_, index) => ({
          clerkUserId: `e2e-fixture-${crypto.randomUUID()}`,
          role: "user" as const,
          displayName: `${tag} #${index + 1}`,
          activeLanguageId: languageId,
          createdAt: new Date(base - index * 1000),
        })),
      )
      .returning({ id: users.id });
    return rows.map((row) => row.id);
  });
}

/** An account as the database holds it, read independently of the code under test; `null` once it is gone. */
export async function getE2EUser(userId: string): Promise<E2EUser | null> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select(userColumns)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ? toE2EUser(row) : null;
  });
}

/**
 * Real accounts whose name contains `tag`, newest first (then by id) — the
 * ground truth for what the list should show, written separately from the
 * list's own query.
 */
export async function getE2EUsersTagged(tag: string): Promise<E2EUser[]> {
  return withE2EDb(async (db) => {
    const rows = await db
      .select(userColumns)
      .from(users)
      .where(
        and(
          sql`${users.displayName} ilike ${`%${tag}%`}`,
          eq(users.isSandbox, false),
          sql`${users.clerkUserId} is not null`,
        ),
      )
      .orderBy(sql`${users.createdAt} desc`, sql`${users.id} desc`);
    return rows.map(toE2EUser);
  });
}

/**
 * An account's version token as the database writes it: microsecond ISO text,
 * which a JS `Date` cannot hold. Read straight from SQL, apart from the code
 * under test, so a spec can build a *valid* role-change request by hand.
 */
export async function getE2EVersionToken(userId: string): Promise<string> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select({
        token: sql<string>`to_char(${users.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new Error(`No user ${userId} in the E2E database.`);
    return row.token;
  });
}

/**
 * Everything about an account that a role change must leave alone: every column
 * of its row except the two a change is allowed to move (`role`, `updatedAt`),
 * and how much learning data hangs off it. Two snapshots, before and after, must
 * be equal — "no arbitrary progress mutation".
 */
export async function getE2EUserFootprint(userId: string) {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new Error(`No user ${userId} in the E2E database.`);
    const unchanged = Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => key !== "role" && key !== "updatedAt",
      ),
    );
    const rowsOf = async (
      table:
        | typeof userItemProgress
        | typeof userLevelProgress
        | typeof userLanguageSettings,
    ) => {
      const [counted] = await db
        .select({ rows: count() })
        .from(table)
        .where(eq(table.userId, userId));
      return counted?.rows ?? 0;
    };
    return {
      row: unchanged,
      itemProgressRows: await rowsOf(userItemProgress),
      levelProgressRows: await rowsOf(userLevelProgress),
      languageSettingsRows: await rowsOf(userLanguageSettings),
    };
  });
}

/** Sets an account's role straight in the database — another Admin acting behind the screen's back, or a restore. */
export async function setE2EUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  await withE2EDb(async (db) => {
    await db.update(users).set({ role }).where(eq(users.id, userId));
  });
}

/** Renames an account, which moves its version token — "something else changed it" since the Admin looked. */
export async function renameE2EUser(
  userId: string,
  displayName: string,
): Promise<void> {
  await withE2EDb(async (db) => {
    await db.update(users).set({ displayName }).where(eq(users.id, userId));
  });
}

/** The `USER_ROLE_CHANGED` audit events for an account, newest first. */
export async function getE2ERoleAudits(userId: string) {
  return withE2EDb(async (db) => {
    const page = await getAuditEvents(db, {
      action: "USER_ROLE_CHANGED",
      resourceId: userId,
      limit: 50,
    });
    return page.items;
  });
}

/** Removes the role-change audit events about these accounts (the trail is disposable here; a real one never is). */
export async function removeRoleAudits(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db
      .delete(adminAuditEvents)
      .where(
        and(
          eq(adminAuditEvents.action, "USER_ROLE_CHANGED"),
          inArray(adminAuditEvents.resourceId, ids),
        ),
      );
  });
}

/** Removes accounts this module created, and the audit events that name them. */
export async function removeSeededUsers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await removeRoleAudits(ids);
  await withE2EDb(async (db) => {
    await db.delete(users).where(inArray(users.id, ids));
  });
}

/* -------------------------------------------------------------------------- */
/* Bulk-command fixtures (spec 26 Unit 7)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Items for the bulk commands, placed in a throwaway level and group (made with
 * `seedLevel` / `seedGroup`) so that nothing the other specs read — the seeded
 * Level 1 and its order — is ever touched. Rows are inserted directly, in every
 * state a selection can contain; the one state with no row of its own — a
 * published item with an open, unpublished edit — is built through the real
 * `updateItem`, exactly as an author's own edit would leave it.
 */

export type BulkFixtureItem = {
  /** A vocabulary item's term, or a grammar item's structure. */
  term: string;
  type?: "vocabulary" | "grammar";
  /** `draft` is a published item that also carries an unpublished edit. */
  status?: "pending" | "published" | "draft" | "archived";
  /** The group it is filed under; `null` for none (grammar only). Default: the fixture's group for vocabulary, none for grammar. */
  groupId?: string | null;
  /** Default: the next free position of its level and type. */
  position?: number;
  /** Default: its position. A different value builds the drift a move must repair. */
  lessonPriority?: number;
};

export type E2EItemRow = {
  id: string;
  type: "vocabulary" | "grammar";
  /** The column as stored: a published item with an open edit is still `published` here (`hasDraft` says it has one). */
  status: "draft" | "pending" | "published" | "archived";
  version: number;
  levelId: string;
  groupId: string | null;
  position: number;
  lessonPriority: number;
  hasDraft: boolean;
};

/** Inserts `items` into `levelId`, returning their ids in the same order. Remove them with `removeBulkFixtureItems`. */
export async function seedBulkItems(
  levelId: string,
  groupId: string,
  items: BulkFixtureItem[],
): Promise<string[]> {
  const ids = items.map(() => crypto.randomUUID());
  await withE2EDb(async (db) => {
    const [level] = await db
      .select({ languageId: levels.languageId })
      .from(levels)
      .where(eq(levels.id, levelId))
      .limit(1);
    if (!level) throw new Error(`No level ${levelId} to put items in.`);

    await db.transaction(async (tx) => {
      const next = { vocabulary: 1, grammar: 1 };
      for (const type of ["vocabulary", "grammar"] as const) {
        const [highest] = await tx
          .select({
            position: sql<number>`coalesce(max(${learningItems.position}), 0)::int`,
          })
          .from(learningItems)
          .where(
            and(
              eq(learningItems.levelId, levelId),
              eq(learningItems.type, type),
            ),
          );
        next[type] = (highest?.position ?? 0) + 1;
      }
      const positions = items.map(
        (item) => item.position ?? next[item.type ?? "vocabulary"]++,
      );

      await tx.insert(learningItems).values(
        items.map((item, index) => ({
          id: ids[index]!,
          languageId: level.languageId,
          levelId,
          type: item.type ?? ("vocabulary" as const),
          status:
            item.status === undefined || item.status === "draft"
              ? ("published" as const)
              : item.status,
          position: positions[index]!,
          lessonPriority: item.lessonPriority ?? positions[index]!,
        })),
      );

      const filedUnder = (item: BulkFixtureItem) =>
        item.groupId !== undefined
          ? item.groupId
          : (item.type ?? "vocabulary") === "vocabulary"
            ? groupId
            : null;
      const vocabulary = items.flatMap((item, index) =>
        (item.type ?? "vocabulary") === "vocabulary" ? [{ item, index }] : [],
      );
      const grammar = items.flatMap((item, index) =>
        item.type === "grammar" ? [{ item, index }] : [],
      );
      if (vocabulary.length > 0) {
        await tx.insert(vocabularyItems).values(
          vocabulary.map(({ item, index }) => {
            const group = filedUnder(item);
            if (group === null)
              throw new Error("A vocabulary item needs a group.");
            return {
              learningItemId: ids[index]!,
              vocabularyGroupId: group,
              term: item.term,
              primaryMeaning: `meaning of ${item.term}`,
              partOfSpeech: "noun" as const,
            };
          }),
        );
      }
      if (grammar.length > 0) {
        await tx.insert(grammarItems).values(
          grammar.map(({ item, index }) => ({
            learningItemId: ids[index]!,
            structure: item.term,
            primaryMeaning: `meaning of ${item.term}`,
            explanation: `explanation of ${item.term}`,
            vocabularyGroupId: filedUnder(item),
          })),
        );
      }
    });
  });

  const drafted = items.flatMap((item, index) =>
    item.status === "draft" ? [{ item, id: ids[index]! }] : [],
  );
  if (drafted.length > 0) {
    const actorUserId = await getE2EAdminUserId();
    await withE2EDb(async (db) => {
      for (const { item, id } of drafted) {
        const { savedAsDraft } = await updateItem(db, {
          learningItemId: id,
          actorUserId,
          idempotencyKey: crypto.randomUUID(),
          type: "vocabulary",
          fields: vocabularyFields(
            item.groupId ?? groupId,
            item.term,
            `edited ${item.term}`,
          ),
        });
        if (!savedAsDraft)
          throw new Error("The edit to a published item was not a draft.");
      }
    });
  }
  return ids;
}

/**
 * The items as the database holds them, read independently of the code under
 * test, in the order of `ids`; `null` for one that is gone.
 */
export async function getE2EItemRows(
  ids: string[],
): Promise<(E2EItemRow | null)[]> {
  if (ids.length === 0) return [];
  return withE2EDb(async (db) => {
    const rows = await db
      .select({
        id: learningItems.id,
        type: learningItems.type,
        status: learningItems.status,
        version: learningItems.version,
        levelId: learningItems.levelId,
        position: learningItems.position,
        lessonPriority: learningItems.lessonPriority,
        vocabularyGroupId: vocabularyItems.vocabularyGroupId,
        grammarGroupId: grammarItems.vocabularyGroupId,
        draftId: curriculumItemDrafts.id,
      })
      .from(learningItems)
      .leftJoin(
        vocabularyItems,
        eq(vocabularyItems.learningItemId, learningItems.id),
      )
      .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
      .leftJoin(
        curriculumItemDrafts,
        eq(curriculumItemDrafts.learningItemId, learningItems.id),
      )
      .where(inArray(learningItems.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => {
      const row = byId.get(id);
      if (!row) return null;
      return {
        id: row.id,
        type: row.type,
        status: row.status,
        version: row.version,
        levelId: row.levelId,
        groupId:
          row.type === "vocabulary"
            ? row.vocabularyGroupId
            : row.grammarGroupId,
        position: row.position,
        lessonPriority: row.lessonPriority,
        hasDraft: row.draftId !== null,
      };
    });
  });
}

/** A level's items of one type, by position — the ground truth for an order, and for "nothing else moved". */
export async function getE2ELevelOrder(
  levelId: string,
  type: "vocabulary" | "grammar",
): Promise<{ id: string; position: number; lessonPriority: number }[]> {
  return withE2EDb(async (db) =>
    db
      .select({
        id: learningItems.id,
        position: learningItems.position,
        lessonPriority: learningItems.lessonPriority,
      })
      .from(learningItems)
      .where(
        and(eq(learningItems.levelId, levelId), eq(learningItems.type, type)),
      )
      .orderBy(learningItems.position),
  );
}

/** How many audit events of `action` exist for an item — one per real change, never per click or retry. */
export async function countE2EItemAudits(
  action: AdminAuditAction,
  resourceId: string,
): Promise<number> {
  return withE2EDb(async (db) => {
    const page = await getAuditEvents(db, { action, resourceId, limit: 50 });
    return page.items.length;
  });
}

/** Removes items made by `seedBulkItems` (either type, and any draft), and nothing else. */
export async function removeBulkFixtureItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db.transaction(async (tx) => {
      await tx
        .delete(curriculumItemDrafts)
        .where(inArray(curriculumItemDrafts.learningItemId, ids));
      await tx
        .delete(vocabularyItems)
        .where(inArray(vocabularyItems.learningItemId, ids));
      await tx
        .delete(grammarItems)
        .where(inArray(grammarItems.learningItemId, ids));
      await tx.delete(learningItems).where(inArray(learningItems.id, ids));
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Import-history fixtures (spec 26 Unit 8)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rows of the curriculum-import history, inserted directly in every state the
 * pipeline can leave one in. The pipeline itself — S3, SQS, the preview and
 * commit Lambdas — is not what this screen is about and is never started here:
 * a fixture's `s3Key` names no object and sits outside the `imports/` prefix the
 * bucket's upload trigger watches. The one AWS call a spec can cause is the call
 * the product itself makes when an archived import is permanently deleted — a
 * best-effort `DeleteObject` of that made-up key, which removes nothing.
 *
 * Every import carries its spec run's tag at the front of the file's name, so a
 * spec finds its own rows among any others and removes exactly them, together
 * with the audit events that name them.
 */

export type E2EImportStatus =
  | "uploading"
  | "queued_for_preview"
  | "previewing"
  | "needs_review"
  | "ready_to_import"
  | "queued_for_import"
  | "importing"
  | "completed"
  | "failed";

export type SeedImportOptions = {
  /** The file's name as the history shows it; start it with the spec's tag. */
  filename: string;
  /** Default `completed`. */
  status?: E2EImportStatus;
  /** Default: the E2E admin's own language. */
  languageId?: string;
  /** In the archived history, archived by the E2E admin. */
  archived?: boolean;
  /** Default: the database's own clock — the same instant for every row of one insert. */
  createdAt?: Date;
  totalRows?: number;
  createCount?: number;
  updateCount?: number;
  moveCount?: number;
  unchangedCount?: number;
  reviewCount?: number;
  skippedCount?: number;
  previewVersion?: number;
  confirmedPreviewVersion?: number | null;
  attemptCount?: number;
  lastErrorCode?: string | null;
  lastErrorSummary?: string | null;
  draftedItemIds?: string[] | null;
};

export type E2EImport = {
  id: string;
  filename: string;
  status: E2EImportStatus;
  languageId: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  moveCount: number;
  unchangedCount: number;
  reviewCount: number;
  skippedCount: number;
  previewVersion: number;
  confirmedPreviewVersion: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
  draftedItemIds: string[] | null;
  s3Key: string;
  confirmedAt: Date | null;
  archivedAt: Date | null;
  archivedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const importColumns = {
  id: curriculumImports.id,
  filename: curriculumImports.originalFilename,
  status: curriculumImports.status,
  languageId: curriculumImports.languageId,
  totalRows: curriculumImports.totalRows,
  createCount: curriculumImports.createCount,
  updateCount: curriculumImports.updateCount,
  moveCount: curriculumImports.moveCount,
  unchangedCount: curriculumImports.unchangedCount,
  reviewCount: curriculumImports.reviewCount,
  skippedCount: curriculumImports.skippedCount,
  previewVersion: curriculumImports.previewVersion,
  confirmedPreviewVersion: curriculumImports.confirmedPreviewVersion,
  attemptCount: curriculumImports.attemptCount,
  lastErrorCode: curriculumImports.lastErrorCode,
  lastErrorSummary: curriculumImports.lastErrorSummary,
  draftedItemIds: curriculumImports.draftedItemIds,
  s3Key: curriculumImports.s3Key,
  confirmedAt: curriculumImports.confirmedAt,
  archivedAt: curriculumImports.archivedAt,
  archivedByUserId: curriculumImports.archivedByUserId,
  createdAt: curriculumImports.createdAt,
  updatedAt: curriculumImports.updatedAt,
};

/** What the pipeline would have left at each status, for a field a spec did not name. */
function importDefaults(status: E2EImportStatus) {
  const previewed = status !== "uploading" && status !== "queued_for_preview";
  const reviewed = previewed && status !== "previewing";
  const confirmed =
    status === "queued_for_import" ||
    status === "importing" ||
    status === "completed" ||
    status === "failed";
  return {
    previewVersion: reviewed ? 1 : 0,
    confirmedPreviewVersion: confirmed ? 1 : null,
    attemptCount: status === "failed" ? 1 : 0,
  };
}

/** One import in the given state — `needs_review` and later have a preview to show. Remove it with `removeSeededImports`. */
export async function seedImport(
  options: SeedImportOptions,
): Promise<E2EImport> {
  const [made] = await seedImports([options]);
  return made!;
}

/** Several imports in one statement — so they share the database's clock unless a `createdAt` says otherwise. */
export async function seedImports(
  all: SeedImportOptions[],
): Promise<E2EImport[]> {
  const uploadedByUserId = await getE2EAdminUserId();
  return withE2EDb(async (db) => {
    const { languageId: ownLanguageId } = await adminScope(db);
    const rows = await db
      .insert(curriculumImports)
      .values(
        all.map((options) => {
          const status = options.status ?? "completed";
          const defaults = importDefaults(status);
          return {
            environment: "development",
            languageId: options.languageId ?? ownLanguageId,
            originalFilename: options.filename,
            fileExtension: "csv",
            s3Bucket: "e2e-fixture",
            // Names no object, and is outside `imports/` — see the note above.
            s3Key: `e2e-fixtures/${crypto.randomUUID()}/source.csv`,
            uploadedByUserId,
            status,
            totalRows: options.totalRows ?? 0,
            createCount: options.createCount ?? 0,
            updateCount: options.updateCount ?? 0,
            moveCount: options.moveCount ?? 0,
            unchangedCount: options.unchangedCount ?? 0,
            reviewCount: options.reviewCount ?? 0,
            skippedCount: options.skippedCount ?? 0,
            previewVersion: options.previewVersion ?? defaults.previewVersion,
            confirmedPreviewVersion:
              options.confirmedPreviewVersion === undefined
                ? defaults.confirmedPreviewVersion
                : options.confirmedPreviewVersion,
            attemptCount: options.attemptCount ?? defaults.attemptCount,
            lastErrorCode: options.lastErrorCode ?? null,
            lastErrorSummary: options.lastErrorSummary ?? null,
            draftedItemIds: options.draftedItemIds ?? null,
            ...(options.archived
              ? { archivedAt: new Date(), archivedByUserId: uploadedByUserId }
              : {}),
            ...(options.createdAt ? { createdAt: options.createdAt } : {}),
          };
        }),
      )
      .returning(importColumns);
    return rows;
  });
}

/**
 * `howMany` imports named `<tag> #1.csv` … `<tag> #n.csv` in one statement. With
 * no `createdAt` every one has the *same* instant, to the microsecond — what
 * several uploads made by one statement look like, and what a cursor that rounds
 * to the millisecond gets wrong.
 */
export async function seedManyImports(
  tag: string,
  howMany: number,
  options: {
    archived?: boolean;
    languageId?: string;
    createdAt?: (index: number) => Date;
  } = {},
): Promise<string[]> {
  const made = await seedImports(
    Array.from({ length: howMany }, (_, index) => ({
      filename: `${tag} #${index + 1}.csv`,
      status: "completed" as const,
      archived: options.archived,
      languageId: options.languageId,
      createdAt: options.createdAt?.(index),
    })),
  );
  return made.map((record) => record.id);
}

/** A preview row for an import that needs review. */
export type SeedImportRow = {
  rowNumber: number;
  displayTerm: string;
  classification: "create" | "update" | "move" | "unchanged" | "blocked";
  levelNumber?: number;
  groupNumber?: number;
  reviewReason?: string;
  adminDisposition?: "skip" | "approve_move";
};

/** Preview rows for an import, as the preview job leaves them. They go with the import. */
export async function seedImportRows(
  importId: string,
  rows: SeedImportRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await withE2EDb(async (db) => {
    await db.insert(curriculumImportRows).values(
      rows.map((row) => ({
        importId,
        rowNumber: row.rowNumber,
        itemType: "vocabulary" as const,
        displayTerm: row.displayTerm,
        levelNumber: row.levelNumber ?? 1,
        groupNumber: row.groupNumber ?? 1,
        classification: row.classification,
        reviewReason: row.reviewReason ?? null,
        adminDisposition: row.adminDisposition ?? null,
      })),
    );
  });
}

/** An import as the database holds it, read independently of the code under test; `null` once it is gone. */
export async function getE2EImport(
  importId: string,
): Promise<E2EImport | null> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select(importColumns)
      .from(curriculumImports)
      .where(eq(curriculumImports.id, importId))
      .limit(1);
    return row ?? null;
  });
}

/**
 * What the pipeline does between two reads of the history: moves an import on.
 * Written straight to the table, as the Lambda's own writes are — never through
 * the Admin console, which has no such command.
 */
export async function advanceE2EImport(
  importId: string,
  to: {
    status: E2EImportStatus;
    totalRows?: number;
    createCount?: number;
    updateCount?: number;
    moveCount?: number;
    reviewCount?: number;
    previewVersion?: number;
    attemptCount?: number;
    lastErrorCode?: string | null;
    lastErrorSummary?: string | null;
  },
): Promise<void> {
  await withE2EDb(async (db) => {
    const updated = await db
      .update(curriculumImports)
      .set({ ...to, updatedAt: new Date() })
      .where(eq(curriculumImports.id, importId))
      .returning({ id: curriculumImports.id });
    if (updated.length !== 1) throw new Error(`No import ${importId} to move.`);
  });
}

/** The imports of a spec run (named from `tag`), in the order the history shows them: newest first, then by id. */
export async function getE2EImportsTagged(
  tag: string,
  options: { archived?: boolean; languageId?: string } = {},
): Promise<E2EImport[]> {
  return withE2EDb(async (db) => {
    const { languageId: ownLanguageId } = await adminScope(db);
    const rows = await db
      .select(importColumns)
      .from(curriculumImports)
      .where(
        and(
          like(curriculumImports.originalFilename, `${tag}%`),
          eq(curriculumImports.languageId, options.languageId ?? ownLanguageId),
        ),
      )
      .orderBy(desc(curriculumImports.createdAt), desc(curriculumImports.id));
    return rows.filter((row) =>
      options.archived === undefined
        ? true
        : options.archived
          ? row.archivedAt !== null
          : row.archivedAt === null,
    );
  });
}

/** How many audit events of `action` name an import — one per real change, never per click or retry. */
export async function countE2EImportAudits(
  action: AdminAuditAction,
  importId: string,
): Promise<number> {
  return withE2EDb(async (db) => {
    const page = await getAuditEvents(db, {
      action,
      resourceId: importId,
      limit: 50,
    });
    return page.items.length;
  });
}

/** Every audit event that names an import, oldest first — what the trail says happened to it. */
export async function getE2EImportAuditActions(
  importId: string,
): Promise<string[]> {
  return withE2EDb(async (db) => {
    const rows = await db
      .select({ action: adminAuditEvents.action })
      .from(adminAuditEvents)
      .where(
        and(
          eq(adminAuditEvents.resourceType, "curriculum_import"),
          eq(adminAuditEvents.resourceId, importId),
        ),
      )
      .orderBy(asc(adminAuditEvents.createdAt), asc(adminAuditEvents.id));
    return rows.map((row) => row.action);
  });
}

/** Removes imports this module created (their preview rows go with them), and the audit events that name them. */
export async function removeSeededImports(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db
      .delete(adminAuditEvents)
      .where(
        and(
          eq(adminAuditEvents.resourceType, "curriculum_import"),
          inArray(adminAuditEvents.resourceId, ids),
        ),
      );
    await db
      .delete(curriculumImports)
      .where(inArray(curriculumImports.id, ids));
  });
}

/** Archives or restores an import directly — what another Admin's click would do while a page still shows the old state. */
export async function setE2EImportArchived(
  importId: string,
  archived: boolean,
): Promise<void> {
  const archivedByUserId = await getE2EAdminUserId();
  await withE2EDb(async (db) => {
    const updated = await db
      .update(curriculumImports)
      .set(
        archived
          ? { archivedAt: new Date(), archivedByUserId, updatedAt: new Date() }
          : { archivedAt: null, archivedByUserId: null, updatedAt: new Date() },
      )
      .where(eq(curriculumImports.id, importId))
      .returning({ id: curriculumImports.id });
    if (updated.length !== 1)
      throw new Error(`No import ${importId} to archive or restore.`);
  });
}

/** Removes every import whose file name starts with `prefix` (and the audit events that name them) — what an aborted run may have left behind. */
export async function removeImportsNamed(prefix: string): Promise<void> {
  const left = await withE2EDb((db) =>
    db
      .select({ id: curriculumImports.id })
      .from(curriculumImports)
      .where(like(curriculumImports.originalFilename, `${prefix}%`)),
  );
  await removeSeededImports(left.map((row) => row.id));
}

/** What an Admin has decided about each preview row of an import, in row order — `null` where nothing has been. */
export async function getE2EImportRowDispositions(
  importId: string,
): Promise<
  { rowNumber: number; adminDisposition: "skip" | "approve_move" | null }[]
> {
  return withE2EDb((db) =>
    db
      .select({
        rowNumber: curriculumImportRows.rowNumber,
        adminDisposition: curriculumImportRows.adminDisposition,
      })
      .from(curriculumImportRows)
      .where(eq(curriculumImportRows.importId, importId))
      .orderBy(asc(curriculumImportRows.rowNumber)),
  );
}

/** How many preview rows an import still has — what permanently deleting it must take with it. */
export async function countE2EImportRows(importId: string): Promise<number> {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select({ rows: count() })
      .from(curriculumImportRows)
      .where(eq(curriculumImportRows.importId, importId));
    return row?.rows ?? 0;
  });
}

/* -------------------------------------------------------------------------- */
/* Dictionary-queue fixtures (spec 26 Unit 9)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Mapping rows — with the dictionary entries and the source they name — for
 * words made with `seedBulkItems`, inserted directly in each state the queue can
 * show. The importer and the matcher are not what this screen is about and are
 * never started: a fixture is the row they would have left behind.
 *
 * One source per call, under a code of its own, so a spec's rows never meet the
 * source another run — or a real import — made. A word with no row at all is
 * simply a word never passed to `seedMappings`: the queue lists it as "never
 * matched".
 */

export type E2EMatchStatus =
  | "unmatched"
  | "source_data_not_imported"
  | "auto_matched"
  | "review_required"
  | "manual";

export type SeedMapping = {
  /** The vocabulary item the mapping belongs to. */
  itemId: string;
  matchStatus: E2EMatchStatus;
  confidence?: "high" | "medium" | "low";
  reviewReason?: string;
  manualLock?: boolean;
  /** The candidate entry's headword. Omit for a mapping that names none — one that cannot be confirmed. */
  entryLemma?: string;
};

export type SeededMappings = { sourceId: string; entryIds: string[] };

export type E2EMapping = {
  vocabularyItemId: string;
  matchStatus: E2EMatchStatus;
  confidence: "high" | "medium" | "low" | null;
  reviewReason: string | null;
  manualLock: boolean;
  dictionaryEntryId: string | null;
  mappedByUserId: string | null;
};

/** Inserts a source, an entry for each mapping that names one, and the mappings. Remove them with `removeSeededMappings`. */
export async function seedMappings(
  mappings: SeedMapping[],
): Promise<SeededMappings> {
  const actorUserId = await getE2EAdminUserId();
  return withE2EDb(async (db) =>
    db.transaction(async (tx) => {
      const [source] = await tx
        .insert(lexicalSources)
        .values({
          code: `e2e-${crypto.randomUUID().slice(0, 8)}`,
          provider: "e2e",
          sourceType: "dictionary",
          sourceLanguage: "es",
          entryLanguage: "en",
          licenseMetadata: {},
          attributionText: "Playwright fixture — not a real dictionary.",
        })
        .returning({ id: lexicalSources.id });

      const entryIds: string[] = [];
      for (const mapping of mappings) {
        const [item] = await tx
          .select({ languageId: learningItems.languageId })
          .from(learningItems)
          .where(eq(learningItems.id, mapping.itemId))
          .limit(1);
        if (!item) throw new Error(`No item ${mapping.itemId} to map.`);

        let entryId: string | null = null;
        if (mapping.entryLemma) {
          const [entry] = await tx
            .insert(dictionaryEntries)
            .values({
              languageId: item.languageId,
              sourceId: source!.id,
              lemma: mapping.entryLemma,
              normalizedLemma: mapping.entryLemma.toLowerCase(),
              partOfSpeech: "noun",
              sourceEntryKey: `${mapping.entryLemma}#noun#${entryIds.length}`,
            })
            .returning({ id: dictionaryEntries.id });
          entryId = entry!.id;
          entryIds.push(entryId);
        }

        const manual = mapping.matchStatus === "manual";
        await tx.insert(vocabularyDictionaryMappings).values({
          vocabularyItemId: mapping.itemId,
          dictionaryEntryId: entryId,
          lookupForm: mapping.entryLemma ?? "e2e",
          matchStatus: mapping.matchStatus,
          confidence: mapping.confidence ?? null,
          reviewReason: mapping.reviewReason ?? null,
          manualLock: mapping.manualLock ?? false,
          mappedByUserId: manual ? actorUserId : null,
          mappedAt: manual ? new Date() : null,
        });
      }
      return { sourceId: source!.id, entryIds };
    }),
  );
}

/**
 * The mappings as the database holds them, read independently of the code under
 * test, in the order of `itemIds`; `null` for a word that has none.
 */
export async function getE2EMappings(
  itemIds: string[],
): Promise<(E2EMapping | null)[]> {
  if (itemIds.length === 0) return [];
  return withE2EDb(async (db) => {
    const rows = await db
      .select({
        vocabularyItemId: vocabularyDictionaryMappings.vocabularyItemId,
        matchStatus: vocabularyDictionaryMappings.matchStatus,
        confidence: vocabularyDictionaryMappings.confidence,
        reviewReason: vocabularyDictionaryMappings.reviewReason,
        manualLock: vocabularyDictionaryMappings.manualLock,
        dictionaryEntryId: vocabularyDictionaryMappings.dictionaryEntryId,
        mappedByUserId: vocabularyDictionaryMappings.mappedByUserId,
      })
      .from(vocabularyDictionaryMappings)
      .where(inArray(vocabularyDictionaryMappings.vocabularyItemId, itemIds));
    const byItem = new Map(rows.map((row) => [row.vocabularyItemId, row]));
    return itemIds.map((id) => byItem.get(id) ?? null);
  });
}

/** What another Admin's rematch would leave behind while a page still shows the old queue: the word names no candidate, so there is nothing to confirm. */
export async function clearE2EMappingEntry(itemId: string): Promise<void> {
  await withE2EDb(async (db) => {
    const updated = await db
      .update(vocabularyDictionaryMappings)
      .set({
        dictionaryEntryId: null,
        matchStatus: "unmatched",
        confidence: null,
        reviewReason: null,
        manualLock: false,
        updatedAt: new Date(),
      })
      .where(eq(vocabularyDictionaryMappings.vocabularyItemId, itemId))
      .returning({ id: vocabularyDictionaryMappings.id });
    if (updated.length !== 1)
      throw new Error(`No mapping of ${itemId} to clear.`);
  });
}

/**
 * Removes what `seedMappings` made — the mappings of `itemIds` first (they
 * reference the entries), then the entries and the source — and the audit
 * events that name those words. Call it before removing the words themselves.
 */
export async function removeSeededMappings(
  seeded: SeededMappings,
  itemIds: string[],
): Promise<void> {
  await withE2EDb(async (db) => {
    if (itemIds.length > 0) {
      await db
        .delete(vocabularyDictionaryMappings)
        .where(inArray(vocabularyDictionaryMappings.vocabularyItemId, itemIds));
      await db
        .delete(adminAuditEvents)
        .where(
          and(
            eq(adminAuditEvents.resourceType, "vocabulary_dictionary_mapping"),
            inArray(adminAuditEvents.resourceId, itemIds),
          ),
        );
    }
    if (seeded.entryIds.length > 0)
      await db
        .delete(dictionaryEntries)
        .where(inArray(dictionaryEntries.id, seeded.entryIds));
    await db
      .delete(lexicalSources)
      .where(eq(lexicalSources.id, seeded.sourceId));
  });
}

/* -------------------------------------------------------------------------- */
/* Deck fixtures (spec 26 Unit 10)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Decks inserted directly: an official Polyglot deck in either availability, and
 * a learner's personal deck — which the Admin list must never show. Deck
 * *content* is not what this screen is about (the specialist editor owns it), so
 * a deck is whatever rows the editor would have left, items in the order given.
 */

export type E2EDeck = {
  id: string;
  languageId: string;
  kind: "polyglot" | "personal";
  name: string;
  description: string | null;
  availability: "theme" | "level";
  gateLevelId: string | null;
  ownerUserId: string | null;
  itemCount: number;
};

export type SeedDeckOptions = {
  name: string;
  description?: string | null;
  /** Official decks only; a personal deck is always `theme`. Default `theme`. */
  availability?: "theme" | "level";
  /** The level that unlocks a `level` deck. */
  gateLevelId?: string;
  /** Published items of the deck's language, in deck order. */
  itemIds?: string[];
  /** Makes it a learner's personal deck, owned by this user. Omit for an official deck. */
  ownerUserId?: string;
  /** Default: the E2E admin's own language. */
  languageId?: string;
};

/** Inserts a deck and its items. Remove it with `removeSeededDecks`. */
export async function seedDeck(options: SeedDeckOptions): Promise<E2EDeck> {
  return withE2EDb(async (db) => {
    const languageId = options.languageId ?? (await adminScope(db)).languageId;
    const personal = options.ownerUserId !== undefined;
    const availability = personal ? "theme" : (options.availability ?? "theme");
    if (availability === "level" && !options.gateLevelId)
      throw new Error("A level deck needs the level that unlocks it.");
    const itemIds = options.itemIds ?? [];

    return db.transaction(async (tx) => {
      const [deck] = await tx
        .insert(decks)
        .values({
          languageId,
          kind: personal ? ("personal" as const) : ("polyglot" as const),
          ownerUserId: options.ownerUserId ?? null,
          name: options.name,
          description: options.description ?? null,
          availability,
          gateLevelId: availability === "level" ? options.gateLevelId! : null,
        })
        .returning({ id: decks.id });
      if (itemIds.length > 0) {
        await tx.insert(deckItems).values(
          itemIds.map((learningItemId, index) => ({
            deckId: deck!.id,
            languageId,
            learningItemId,
            position: index + 1,
          })),
        );
      }
      return {
        id: deck!.id,
        languageId,
        kind: personal ? ("personal" as const) : ("polyglot" as const),
        name: options.name,
        description: options.description ?? null,
        availability,
        gateLevelId: availability === "level" ? options.gateLevelId! : null,
        ownerUserId: options.ownerUserId ?? null,
        itemCount: itemIds.length,
      };
    });
  });
}

/**
 * Every deck — official or personal, any language — whose name starts with
 * `prefix`, by name, as the database holds it. How a spec finds the decks it made
 * (or the one the UI under test just made), and reads them independently of the
 * code under test.
 */
export async function getE2EDecksNamed(prefix: string): Promise<E2EDeck[]> {
  return withE2EDb(async (db) => {
    const found = await db
      .select({
        id: decks.id,
        languageId: decks.languageId,
        kind: decks.kind,
        name: decks.name,
        description: decks.description,
        availability: decks.availability,
        gateLevelId: decks.gateLevelId,
        ownerUserId: decks.ownerUserId,
      })
      .from(decks)
      .where(like(decks.name, `${prefix}%`))
      .orderBy(asc(decks.name), asc(decks.id));
    if (found.length === 0) return [];

    // A second query, not a correlated subquery in the first: Drizzle leaves
    // table names off every column of a single-table query, so `deck_id = id`
    // inside the subquery would compare the items' own columns and count 0.
    const counts = await db
      .select({ deckId: deckItems.deckId, itemCount: count() })
      .from(deckItems)
      .where(
        inArray(
          deckItems.deckId,
          found.map((deck) => deck.id),
        ),
      )
      .groupBy(deckItems.deckId);
    const countOf = new Map(counts.map((row) => [row.deckId, row.itemCount]));
    return found.map((deck) => ({
      ...deck,
      itemCount: countOf.get(deck.id) ?? 0,
    }));
  });
}

/** Removes decks (their items go with them) and the audit events that name them. */
export async function removeSeededDecks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withE2EDb(async (db) => {
    await db
      .delete(adminAuditEvents)
      .where(
        and(
          like(adminAuditEvents.action, "DECK_%"),
          inArray(adminAuditEvents.resourceId, ids),
        ),
      );
    await db.delete(decks).where(inArray(decks.id, ids));
  });
}
