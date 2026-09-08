import { and, asc, count, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  deckItems,
  decks,
  grammarItems,
  learningItems,
  levels,
  userItemProgress,
  userLevelProgress,
  vocabularyItems,
} from "@/db/schema";
import type { SrsStage } from "@/domains/srs";

import { deriveDeckContentType } from "./deck-view";
import type {
  DeckAvailability,
  DeckDetail,
  DeckItemRow,
  DeckItemType,
  DeckKind,
  DeckSummary,
  DeckPickerItem,
} from "./deck-types";

/**
 * Deck data access (spec 14). Every function takes an injected `DbClient`
 * rather than the `db` singleton — the rule every repository in this
 * codebase follows (see progress-tracker.md's "Repository functions take an
 * injected DbClient" decision), which is also what makes these functions
 * testable inside a rolled-back transaction.
 *
 * Two invariants are enforced in SQL here rather than trusted to callers:
 * a deck never exposes unpublished curriculum, and a learner never sees a
 * deck (or a deck item) they have not reached.
 */

/** Only published curriculum is ever practicable, in a deck exactly as in a lesson or review. */
const PUBLISHED = "published" as const;

/** A raw deck row, used for authorization and shape checks — never returned to a component. */
export type DeckRecord = {
  id: string;
  languageId: string;
  kind: DeckKind;
  ownerUserId: string | null;
  name: string;
  description: string | null;
  availability: DeckAvailability;
  gateLevelId: string | null;
};

function unlockedLevelIds(db: DbClient, userId: string) {
  return db
    .select({ levelId: userLevelProgress.levelId })
    .from(userLevelProgress)
    .where(eq(userLevelProgress.userId, userId));
}

/**
 * Which decks this learner may see (spec 14's "Polyglot Deck Availability"):
 * their own personal decks, every Polyglot theme deck, and a Polyglot level
 * deck only once its gating Level is unlocked.
 */
function visibleDeckCondition(db: DbClient, userId: string, languageId: string) {
  return and(
    eq(decks.languageId, languageId),
    or(
      eq(decks.ownerUserId, userId),
      and(eq(decks.kind, "polyglot"), eq(decks.availability, "theme")),
      and(eq(decks.kind, "polyglot"), eq(decks.availability, "level"), inArray(decks.gateLevelId, unlockedLevelIds(db, userId))),
    ),
  );
}

type DeckItemCounts = {
  configured: Record<DeckItemType, number>;
  /** Configured items this learner has actually learned (has SRS progress for). */
  learned: Record<DeckItemType, number>;
};

function emptyCounts(): DeckItemCounts {
  return { configured: { vocabulary: 0, grammar: 0 }, learned: { vocabulary: 0, grammar: 0 } };
}

/**
 * Per-deck configured/learned item counts in one grouped query, never one
 * query per deck. The left join to `user_item_progress` is what makes a
 * theme deck's count grow on its own as the learner studies more.
 */
async function getDeckItemCounts(db: DbClient, deckIds: string[], userId: string): Promise<Map<string, DeckItemCounts>> {
  const byDeck = new Map<string, DeckItemCounts>();
  if (deckIds.length === 0) return byDeck;

  const rows = await db
    .select({
      deckId: deckItems.deckId,
      type: learningItems.type,
      configured: count(),
      learned: sql<number>`count(*) filter (where ${userItemProgress.learningItemId} is not null)`.mapWith(Number),
    })
    .from(deckItems)
    .innerJoin(learningItems, eq(learningItems.id, deckItems.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(
      userItemProgress,
      and(eq(userItemProgress.learningItemId, deckItems.learningItemId), eq(userItemProgress.userId, userId)),
    )
    .where(and(inArray(deckItems.deckId, deckIds), eq(learningItems.status, PUBLISHED), eq(levels.status, PUBLISHED)))
    .groupBy(deckItems.deckId, learningItems.type);

  for (const row of rows) {
    const entry = byDeck.get(row.deckId) ?? emptyCounts();
    entry.configured[row.type] = row.configured;
    entry.learned[row.type] = row.learned;
    byDeck.set(row.deckId, entry);
  }
  return byDeck;
}

/**
 * A level deck exposes everything configured once it is available; every
 * other deck exposes only what the learner has reached (spec 14's Theme
 * Decks, and the same rule applied to personal decks so an account reset
 * cannot leave a deck listing items whose progress no longer exists).
 */
function visibleItemCount(availability: DeckAvailability, counts: DeckItemCounts): number {
  const source = availability === "level" ? counts.configured : counts.learned;
  return source.vocabulary + source.grammar;
}

export async function listDecksForLearner(
  db: DbClient,
  { userId, languageId }: { userId: string; languageId: string },
): Promise<DeckSummary[]> {
  const deckRows = await db
    .select({
      id: decks.id,
      kind: decks.kind,
      name: decks.name,
      description: decks.description,
      availability: decks.availability,
    })
    .from(decks)
    .where(visibleDeckCondition(db, userId, languageId))
    .orderBy(asc(decks.name), asc(decks.id));

  const counts = await getDeckItemCounts(db, deckRows.map((row) => row.id), userId);

  return deckRows.map((row) => {
    const deckCounts = counts.get(row.id) ?? emptyCounts();
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      description: row.description,
      contentType: deriveDeckContentType(deckCounts.configured),
      itemCount: visibleItemCount(row.availability, deckCounts),
    };
  });
}

type DeckItemQueryRow = {
  learningItemId: string;
  itemType: DeckItemType;
  position: number;
  term: string | null;
  article: string | null;
  vocabularyMeaning: string | null;
  structure: string | null;
  grammarMeaning: string | null;
  srsStage: SrsStage | null;
};

/**
 * Composes the display strings once, server-side — a UI component never
 * re-derives "article + term" itself (the same rule spec 10's
 * `buildLevelViewModel` follows). A row whose type-specific record is
 * missing is a broken row, not a deck item, and is dropped rather than
 * rendered half-formed.
 */
function toDeckItemRow(row: DeckItemQueryRow): DeckItemRow | null {
  if (row.itemType === "vocabulary") {
    if (row.term === null || row.vocabularyMeaning === null) return null;
    return {
      learningItemId: row.learningItemId,
      itemType: "vocabulary",
      primary: row.article ? `${row.article} ${row.term}` : row.term,
      secondary: row.vocabularyMeaning,
      srsStage: row.srsStage,
    };
  }
  if (row.structure === null || row.grammarMeaning === null) return null;
  return {
    learningItemId: row.learningItemId,
    itemType: "grammar",
    primary: row.structure,
    secondary: row.grammarMeaning,
    srsStage: row.srsStage,
  };
}

async function getDeckItemRows(
  db: DbClient,
  { deckId, userId, learnedOnly }: { deckId: string; userId: string; learnedOnly: boolean },
): Promise<DeckItemRow[]> {
  const rows = await db
    .select({
      learningItemId: deckItems.learningItemId,
      itemType: learningItems.type,
      position: deckItems.position,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      vocabularyMeaning: vocabularyItems.primaryMeaning,
      structure: grammarItems.structure,
      grammarMeaning: grammarItems.primaryMeaning,
      srsStage: userItemProgress.srsStage,
    })
    .from(deckItems)
    .innerJoin(learningItems, eq(learningItems.id, deckItems.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(vocabularyItems, eq(vocabularyItems.learningItemId, deckItems.learningItemId))
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, deckItems.learningItemId))
    .leftJoin(
      userItemProgress,
      and(eq(userItemProgress.learningItemId, deckItems.learningItemId), eq(userItemProgress.userId, userId)),
    )
    .where(
      and(
        eq(deckItems.deckId, deckId),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
        learnedOnly ? isNotNull(userItemProgress.learningItemId) : undefined,
      ),
    )
    .orderBy(asc(deckItems.position));

  return rows.map(toDeckItemRow).filter((row): row is DeckItemRow => row !== null);
}

export async function getDeckForLearner(
  db: DbClient,
  { userId, languageId, deckId }: { userId: string; languageId: string; deckId: string },
): Promise<DeckDetail | null> {
  const [deck] = await db
    .select({
      id: decks.id,
      kind: decks.kind,
      ownerUserId: decks.ownerUserId,
      name: decks.name,
      description: decks.description,
      availability: decks.availability,
    })
    .from(decks)
    .where(and(eq(decks.id, deckId), visibleDeckCondition(db, userId, languageId)))
    .limit(1);

  if (!deck) return null;

  const [items, counts] = await Promise.all([
    getDeckItemRows(db, { deckId, userId, learnedOnly: deck.availability !== "level" }),
    getDeckItemCounts(db, [deckId], userId),
  ]);

  return {
    id: deck.id,
    kind: deck.kind,
    name: deck.name,
    description: deck.description,
    contentType: deriveDeckContentType((counts.get(deckId) ?? emptyCounts()).configured),
    canManage: deck.kind === "personal" && deck.ownerUserId === userId,
    items,
  };
}

/** The raw row, for ownership and shape checks before a mutation. Never returned to the browser as-is. */
export async function getDeckRecord(db: DbClient, deckId: string): Promise<DeckRecord | null> {
  return selectDeckRecord(db, deckId, false);
}

/**
 * The same row, taken `FOR UPDATE`. Every mutation whose decision depends on
 * the deck's current contents — the "cannot remove the last item" rule, an
 * append's next position, a reorder's permutation check — reads through this
 * inside its transaction, so two concurrent requests for one deck serialize
 * instead of racing past each other's checks.
 */
export async function getDeckRecordForUpdate(db: DbClient, deckId: string): Promise<DeckRecord | null> {
  return selectDeckRecord(db, deckId, true);
}

async function selectDeckRecord(db: DbClient, deckId: string, forUpdate: boolean): Promise<DeckRecord | null> {
  const query = db
    .select({
      id: decks.id,
      languageId: decks.languageId,
      kind: decks.kind,
      ownerUserId: decks.ownerUserId,
      name: decks.name,
      description: decks.description,
      availability: decks.availability,
      gateLevelId: decks.gateLevelId,
    })
    .from(decks)
    .where(eq(decks.id, deckId))
    .limit(1);
  const [row] = forUpdate ? await query.for("update") : await query;
  return row ?? null;
}

type PickerQueryRow = {
  learningItemId: string;
  itemType: DeckItemType;
  levelNumber: number;
  term: string | null;
  article: string | null;
  vocabularyMeaning: string | null;
  structure: string | null;
  grammarMeaning: string | null;
  srsStage: SrsStage | null;
};

/** Shared by both pickers — the display strings are composed once, server-side, exactly as they are for a deck row. */
function toPickerItems(rows: PickerQueryRow[]): DeckPickerItem[] {
  const items: DeckPickerItem[] = [];
  for (const row of rows) {
    if (row.itemType === "vocabulary") {
      if (row.term === null || row.vocabularyMeaning === null) continue;
      items.push({
        learningItemId: row.learningItemId,
        itemType: "vocabulary",
        primary: row.article ? `${row.article} ${row.term}` : row.term,
        secondary: row.vocabularyMeaning,
        levelNumber: row.levelNumber,
        srsStage: row.srsStage,
      });
      continue;
    }
    if (row.structure === null || row.grammarMeaning === null) continue;
    items.push({
      learningItemId: row.learningItemId,
      itemType: "grammar",
      primary: row.structure,
      secondary: row.grammarMeaning,
      levelNumber: row.levelNumber,
      srsStage: row.srsStage,
    });
  }
  return items;
}

/**
 * A case-insensitive term/meaning search for the item pickers. The escape
 * pass matters: without it a learner typing `%` would match every item.
 */
function pickerSearchCondition(search: string | undefined) {
  const trimmed = search?.trim() ?? "";
  if (trimmed.length === 0) return undefined;
  const pattern = `%${trimmed.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return or(
    ilike(vocabularyItems.term, pattern),
    ilike(vocabularyItems.primaryMeaning, pattern),
    ilike(grammarItems.structure, pattern),
    ilike(grammarItems.primaryMeaning, pattern),
  );
}

const PICKER_COLUMNS = {
  learningItemId: learningItems.id,
  itemType: learningItems.type,
  levelNumber: levels.levelNumber,
  term: vocabularyItems.term,
  article: vocabularyItems.article,
  vocabularyMeaning: vocabularyItems.primaryMeaning,
  structure: grammarItems.structure,
  grammarMeaning: grammarItems.primaryMeaning,
} as const;

/**
 * Every published item the learner has already learned, for the personal
 * deck item picker. Bounded by `limit` and narrowed by an optional search
 * term rather than returning an unbounded set — a long-running account can
 * accumulate thousands of learned items.
 */
export async function getEligibleDeckItems(
  db: DbClient,
  {
    userId,
    languageId,
    search,
    limit,
  }: { userId: string; languageId: string; search?: string; limit: number },
): Promise<DeckPickerItem[]> {
  const rows = await db
    .select({ ...PICKER_COLUMNS, srsStage: userItemProgress.srsStage })
    .from(userItemProgress)
    .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(userItemProgress.languageId, languageId),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
        pickerSearchCondition(search),
      ),
    )
    .orderBy(asc(levels.levelNumber), asc(learningItems.position), asc(learningItems.id))
    .limit(limit);

  return toPickerItems(rows);
}

/**
 * Every published item in the language, for the Admin deck-item picker. An
 * official deck is authored against the curriculum itself, never against any
 * learner's progress, so there is no `user_item_progress` join here and
 * `srsStage` is always null.
 */
export async function getPublishedItemsForAdmin(
  db: DbClient,
  { languageId, search, limit }: { languageId: string; search?: string; limit: number },
): Promise<DeckPickerItem[]> {
  const rows = await db
    .select({ ...PICKER_COLUMNS, srsStage: sql<SrsStage | null>`null` })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .where(
      and(
        eq(learningItems.languageId, languageId),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
        pickerSearchCondition(search),
      ),
    )
    .orderBy(asc(levels.levelNumber), asc(learningItems.position), asc(learningItems.id))
    .limit(limit);

  return toPickerItems(rows);
}

/**
 * Of the supplied ids, the ones this learner may actually put in a deck:
 * published, in this language, and already learned. The caller compares
 * lengths — a client-supplied id is a request, never proof of eligibility.
 */
export async function filterEligibleLearningItemIds(
  db: DbClient,
  { userId, languageId, learningItemIds }: { userId: string; languageId: string; learningItemIds: string[] },
): Promise<string[]> {
  if (learningItemIds.length === 0) return [];
  const rows = await db
    .select({ id: learningItems.id })
    .from(userItemProgress)
    .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(userItemProgress.languageId, languageId),
        inArray(learningItems.id, learningItemIds),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
      ),
    );
  return rows.map((row) => row.id);
}

/** Of the supplied ids, the ones that are published curriculum in this language. Used for admin-authored decks, which are not gated on any learner's progress. */
export async function filterPublishedLearningItemIds(
  db: DbClient,
  { languageId, learningItemIds }: { languageId: string; learningItemIds: string[] },
): Promise<string[]> {
  if (learningItemIds.length === 0) return [];
  const rows = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .where(
      and(
        eq(learningItems.languageId, languageId),
        inArray(learningItems.id, learningItemIds),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Whether this learner may practice this specific item in this specific
 * deck — the deck must be visible to them, the item must be in it, the
 * curriculum must be published, and (for anything but a level deck) they
 * must have learned it. Answer grading re-checks this on every submission
 * rather than trusting the item id the browser sends back.
 */
export async function isDeckItemPracticable(
  db: DbClient,
  {
    userId,
    languageId,
    deckId,
    learningItemId,
  }: { userId: string; languageId: string; deckId: string; learningItemId: string },
): Promise<boolean> {
  const [row] = await db
    .select({ learningItemId: deckItems.learningItemId })
    .from(deckItems)
    .innerJoin(decks, eq(decks.id, deckItems.deckId))
    .innerJoin(learningItems, eq(learningItems.id, deckItems.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(
      userItemProgress,
      and(eq(userItemProgress.learningItemId, deckItems.learningItemId), eq(userItemProgress.userId, userId)),
    )
    .where(
      and(
        eq(deckItems.deckId, deckId),
        eq(deckItems.learningItemId, learningItemId),
        visibleDeckCondition(db, userId, languageId),
        eq(learningItems.status, PUBLISHED),
        eq(levels.status, PUBLISHED),
        or(eq(decks.availability, "level"), isNotNull(userItemProgress.learningItemId)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function getDeckItemIds(db: DbClient, deckId: string): Promise<string[]> {
  const rows = await db
    .select({ learningItemId: deckItems.learningItemId })
    .from(deckItems)
    .where(eq(deckItems.deckId, deckId))
    .orderBy(asc(deckItems.position));
  return rows.map((row) => row.learningItemId);
}

export type InsertDeckInput = {
  languageId: string;
  kind: DeckKind;
  ownerUserId: string | null;
  name: string;
  description: string | null;
  availability: DeckAvailability;
  gateLevelId: string | null;
};

export async function insertDeck(db: DbClient, input: InsertDeckInput): Promise<string> {
  const [row] = await db.insert(decks).values(input).returning({ id: decks.id });
  return row.id;
}

/** Appends items after whatever the deck already holds, preserving the caller's order. */
export async function insertDeckItems(
  db: DbClient,
  { deckId, languageId, learningItemIds }: { deckId: string; languageId: string; learningItemIds: string[] },
): Promise<void> {
  if (learningItemIds.length === 0) return;
  const [existing] = await db
    .select({ nextPosition: sql<number>`coalesce(max(${deckItems.position}), 0) + 1`.mapWith(Number) })
    .from(deckItems)
    .where(eq(deckItems.deckId, deckId));
  const startPosition = existing?.nextPosition ?? 1;

  await db.insert(deckItems).values(
    learningItemIds.map((learningItemId, index) => ({
      deckId,
      languageId,
      learningItemId,
      position: startPosition + index,
    })),
  );
}

export async function updateDeckFields(
  db: DbClient,
  { deckId, name, description }: { deckId: string; name: string; description: string | null },
): Promise<void> {
  await db.update(decks).set({ name, description }).where(eq(decks.id, deckId));
}

/** Admin-only deck shape change — a learner-facing mutation never reaches this. */
export async function updateDeckAvailability(
  db: DbClient,
  { deckId, availability, gateLevelId }: { deckId: string; availability: DeckAvailability; gateLevelId: string | null },
): Promise<void> {
  await db.update(decks).set({ availability, gateLevelId }).where(eq(decks.id, deckId));
}

export async function deleteDeckItem(
  db: DbClient,
  { deckId, learningItemId }: { deckId: string; learningItemId: string },
): Promise<number> {
  const removed = await db
    .delete(deckItems)
    .where(and(eq(deckItems.deckId, deckId), eq(deckItems.learningItemId, learningItemId)))
    .returning({ id: deckItems.id });
  return removed.length;
}

/**
 * Two-phase position rewrite (negative placeholders first), for the same
 * reason `domains/curriculum`'s `reorderLearningItems` does it: the
 * `(deck_id, position)` unique constraint would otherwise collide mid-update.
 */
export async function reorderDeckItems(db: DbClient, deckId: string, orderedLearningItemIds: string[]): Promise<void> {
  for (let i = 0; i < orderedLearningItemIds.length; i++) {
    await db
      .update(deckItems)
      .set({ position: -(i + 1) })
      .where(and(eq(deckItems.deckId, deckId), eq(deckItems.learningItemId, orderedLearningItemIds[i]!)));
  }
  for (let i = 0; i < orderedLearningItemIds.length; i++) {
    await db
      .update(deckItems)
      .set({ position: i + 1 })
      .where(and(eq(deckItems.deckId, deckId), eq(deckItems.learningItemId, orderedLearningItemIds[i]!)));
  }
}

/** `deck_items` cascades from this delete via its composite foreign key. */
export async function deleteDeck(db: DbClient, deckId: string): Promise<void> {
  await db.delete(decks).where(eq(decks.id, deckId));
}

/** Every Polyglot deck for a language, for the Admin listing — never gated on any learner's progress. */
export async function listPolyglotDecksForAdmin(
  db: DbClient,
  languageId: string,
): Promise<(DeckRecord & { itemCount: number; gateLevelNumber: number | null })[]> {
  const rows = await db
    .select({
      id: decks.id,
      languageId: decks.languageId,
      kind: decks.kind,
      ownerUserId: decks.ownerUserId,
      name: decks.name,
      description: decks.description,
      availability: decks.availability,
      gateLevelId: decks.gateLevelId,
      gateLevelNumber: levels.levelNumber,
      itemCount: sql<number>`(select count(*) from ${deckItems} where ${deckItems.deckId} = ${decks.id})`.mapWith(Number),
    })
    .from(decks)
    .leftJoin(levels, eq(levels.id, decks.gateLevelId))
    .where(and(eq(decks.languageId, languageId), eq(decks.kind, "polyglot")))
    .orderBy(asc(decks.name), asc(decks.id));
  return rows;
}

/** A Polyglot deck's full configured contents for the Admin editor — no learner filtering at all. */
export async function getDeckItemsForAdmin(db: DbClient, deckId: string): Promise<DeckItemRow[]> {
  const rows = await db
    .select({
      learningItemId: deckItems.learningItemId,
      itemType: learningItems.type,
      position: deckItems.position,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      vocabularyMeaning: vocabularyItems.primaryMeaning,
      structure: grammarItems.structure,
      grammarMeaning: grammarItems.primaryMeaning,
      srsStage: sql<SrsStage | null>`null`,
    })
    .from(deckItems)
    .innerJoin(learningItems, eq(learningItems.id, deckItems.learningItemId))
    .leftJoin(vocabularyItems, eq(vocabularyItems.learningItemId, deckItems.learningItemId))
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, deckItems.learningItemId))
    .where(eq(deckItems.deckId, deckId))
    .orderBy(asc(deckItems.position));

  return rows.map(toDeckItemRow).filter((row): row is DeckItemRow => row !== null);
}
