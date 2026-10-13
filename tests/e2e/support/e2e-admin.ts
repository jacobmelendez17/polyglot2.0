import { and, count, eq, inArray, sql } from "drizzle-orm";

import {
  curriculumItemDrafts,
  languages,
  learningItems,
  levels,
  users,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { getAuditEvents } from "@/domains/admin/audit-repository";
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
