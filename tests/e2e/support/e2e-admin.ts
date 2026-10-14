import { and, count, eq, inArray, sql } from "drizzle-orm";

import {
  adminAuditEvents,
  curriculumItemDrafts,
  grammarItems,
  languages,
  learningItems,
  levels,
  userItemProgress,
  userLanguageSettings,
  userLevelProgress,
  users,
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
