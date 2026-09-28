import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  acceptedAnswers,
  curriculumItemDrafts,
  grammarItems,
  learningItemSentences,
  learningItems,
  levels,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";

import {
  getAdjacentAdminCurriculumItemInputSchema,
  getAdminCurriculumItemsInputSchema,
  getLevelContentSummaryInputSchema,
} from "./curriculum-admin-schemas";
import type {
  AdjacentAdminCurriculumItem,
  AdminCurriculumListItem,
  AdminCurriculumItemsPage,
  AdminCurriculumNeedsFilter,
  AdminCurriculumStatusCounts,
  AdminLevelContentSummary,
  GetAdminCurriculumItemsInput,
} from "./curriculum-admin-types";
import type { CurriculumStatus } from "./curriculum-db-types";

/**
 * Admin curriculum read model (spec 11 §8-§13, Unit 3). One joined query —
 * `learning_items` left-joined to both `vocabulary_items` and
 * `grammar_items` (exactly one side populated per row, per each item's
 * `type`) plus `levels`/`vocabulary_groups` for display names — rather than
 * `curriculum-repository.ts`'s per-item detail-attach pattern, since an
 * admin listing page is exactly the N+1-sensitive real consumer
 * architecture.md's "no N+1" rule targets.
 *
 * Sort order is fixed (level, then curriculum position, then id) rather
 * than the dynamic multi-field sort spec 11 §13 illustrates ("such as"
 * language, not a verified requirement — Unit 3's own verify checklist
 * covers language/level/type/status/group/search, not sort fields). This
 * keeps keyset pagination a straightforward 3-key lexicographic comparison
 * over already-indexed, already-typed columns; additional sort options can
 * be added later without restructuring the underlying query.
 */

function computeItemLabel(row: {
  vocabTerm: string | null;
  vocabArticle: string | null;
  grammarStructure: string | null;
}): string {
  if (row.vocabTerm !== null) {
    return row.vocabArticle
      ? `${row.vocabArticle} ${row.vocabTerm}`
      : row.vocabTerm;
  }
  return row.grammarStructure ?? "";
}

function computeMeaningLabel(row: {
  vocabMeaning: string | null;
  grammarMeaning: string | null;
}): string {
  return row.vocabMeaning ?? row.grammarMeaning ?? "";
}

/** The group an item is filed under, whichever kind of item it is. */
const ITEM_GROUP_ID = sql<
  string | null
>`coalesce(${vocabularyItems.vocabularyGroupId}, ${grammarItems.vocabularyGroupId})`;

/**
 * Spec 25 §15's work-queue conditions, one per filter value — each is a
 * plain boolean SQL expression over the same joined tables `SELECTION`
 * already reads, so filtering (`WHERE`) and display (`SELECT`) never risk
 * drifting apart. `NOT EXISTS` for examples/synonyms/variations rather than
 * a `LEFT JOIN ... IS NULL` — an item can have several examples/answers, and
 * a join would multiply rows instead of just testing presence.
 */
const NEEDS_DEFINITION = sql<boolean>`(
  (${learningItems.type} = 'vocabulary' AND ${vocabularyItems.definition} IS NULL)
  OR (${learningItems.type} = 'grammar' AND ${grammarItems.explanation} = '')
)`;
const NEEDS_EXAMPLES = sql<boolean>`NOT EXISTS (
  SELECT 1 FROM ${learningItemSentences}
  WHERE ${learningItemSentences.learningItemId} = ${learningItems.id}
)`;
const NEEDS_IPA = sql<boolean>`(${learningItems.type} = 'vocabulary' AND ${vocabularyItems.ipa} IS NULL)`;
const NEEDS_PRONUNCIATION = sql<boolean>`(${learningItems.type} = 'vocabulary' AND ${vocabularyItems.pronunciation} IS NULL)`;
const NEEDS_SYNONYMS = sql<boolean>`NOT EXISTS (
  SELECT 1 FROM ${acceptedAnswers}
  WHERE ${acceptedAnswers.learningItemId} = ${learningItems.id} AND ${acceptedAnswers.side} = 'meaning'
)`;
const NEEDS_VARIATIONS = sql<boolean>`(
  ${learningItems.type} = 'vocabulary' AND NOT EXISTS (
    SELECT 1 FROM ${acceptedAnswers}
    WHERE ${acceptedAnswers.learningItemId} = ${learningItems.id} AND ${acceptedAnswers.side} = 'term'
  )
)`;

/** One `needs` filter value → the `WHERE` condition it applies. `draft_changes`/`ready_to_publish` reuse the same columns `computeDisplayStatus`/the existing `status="draft"` filter already read — see this file's other uses of `curriculumItemDrafts`/`learningItems.status`. */
function needsFilterCondition(needs: AdminCurriculumNeedsFilter) {
  switch (needs) {
    case "definition":
      return NEEDS_DEFINITION;
    case "examples":
      return NEEDS_EXAMPLES;
    case "ipa":
      return NEEDS_IPA;
    case "pronunciation":
      return NEEDS_PRONUNCIATION;
    case "synonyms":
      return NEEDS_SYNONYMS;
    case "variations":
      return NEEDS_VARIATIONS;
    case "draft_changes":
      return and(
        eq(learningItems.status, "published"),
        isNotNull(curriculumItemDrafts.id),
      )!;
    case "ready_to_publish":
      return eq(learningItems.status, "pending");
  }
}

/** Spec 25 §16's "Next Incomplete Item" — any field this item's own type actually supports being incomplete on. */
const ANY_INCOMPLETE = or(
  NEEDS_DEFINITION,
  NEEDS_EXAMPLES,
  NEEDS_IPA,
  NEEDS_PRONUNCIATION,
  NEEDS_SYNONYMS,
  NEEDS_VARIATIONS,
)!;

const SELECTION = {
  id: learningItems.id,
  type: learningItems.type,
  status: learningItems.status,
  languageId: learningItems.languageId,
  levelId: learningItems.levelId,
  levelNumber: levels.levelNumber,
  position: learningItems.position,
  updatedAt: learningItems.updatedAt,
  vocabTerm: vocabularyItems.term,
  vocabArticle: vocabularyItems.article,
  vocabMeaning: vocabularyItems.primaryMeaning,
  // A vocabulary item's group, or the group a grammar item is filed under.
  vocabGroupId: ITEM_GROUP_ID,
  groupName: vocabularyGroups.name,
  grammarStructure: grammarItems.structure,
  grammarMeaning: grammarItems.primaryMeaning,
  // Whether an open, unpublished edit exists (spec 11 rewrite's "Draft"
  // status) — `learning_items.status` never literally stores `"draft"`
  // (see that column's own default-value comment); the admin-facing
  // display status shows "Draft" as an overlay on a published item
  // instead, so a real answer to "does this have unpublished changes"
  // doesn't require re-deriving it in every UI consumer.
  hasOpenDraft: curriculumItemDrafts.id,
  // Spec 25 §15 — computed here, once, rather than re-derived by every
  // consumer of a list row.
  needsDefinition: NEEDS_DEFINITION,
  needsExamples: NEEDS_EXAMPLES,
  needsIpa: NEEDS_IPA,
  needsPronunciation: NEEDS_PRONUNCIATION,
  needsSynonyms: NEEDS_SYNONYMS,
  needsVariations: NEEDS_VARIATIONS,
} as const;

function computeDisplayStatus(
  status: CurriculumStatus,
  hasOpenDraft: string | null,
): CurriculumStatus {
  return status === "published" && hasOpenDraft !== null ? "draft" : status;
}

function toAdminCurriculumListItem(row: {
  id: string;
  type: "vocabulary" | "grammar";
  status: CurriculumStatus;
  languageId: string;
  levelId: string;
  levelNumber: number;
  position: number;
  updatedAt: Date;
  vocabTerm: string | null;
  vocabArticle: string | null;
  vocabMeaning: string | null;
  vocabGroupId: string | null;
  groupName: string | null;
  grammarStructure: string | null;
  needsDefinition: boolean;
  needsExamples: boolean;
  needsIpa: boolean;
  needsPronunciation: boolean;
  needsSynonyms: boolean;
  needsVariations: boolean;
  grammarMeaning: string | null;
  hasOpenDraft: string | null;
}): AdminCurriculumListItem {
  return {
    id: row.id,
    type: row.type,
    status: computeDisplayStatus(row.status, row.hasOpenDraft),
    languageId: row.languageId,
    levelId: row.levelId,
    levelNumber: row.levelNumber,
    position: row.position,
    itemLabel: computeItemLabel(row),
    meaningLabel: computeMeaningLabel(row),
    groupId: row.vocabGroupId,
    groupName: row.groupName,
    updatedAt: row.updatedAt,
    needsDefinition: row.needsDefinition,
    needsExamples: row.needsExamples,
    needsIpa: row.needsIpa,
    needsPronunciation: row.needsPronunciation,
    needsSynonyms: row.needsSynonyms,
    needsVariations: row.needsVariations,
  };
}

/** Opaque keyset cursor over `(level_number, position, id)`, all ascending — never expose raw ordering keys directly (code-standards.md's pagination rule). */
type Cursor = { levelNumber: number; position: number; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (
    typeof parsed?.levelNumber !== "number" ||
    typeof parsed?.position !== "number" ||
    typeof parsed?.id !== "string"
  ) {
    throw new Error("Invalid admin curriculum cursor");
  }
  return parsed;
}

export async function getAdminCurriculumItems(
  db: DbClient,
  input: GetAdminCurriculumItemsInput,
): Promise<AdminCurriculumItemsPage> {
  const {
    languageId,
    levelId,
    type,
    status,
    groupId,
    search,
    needs,
    limit,
    cursor,
  } = getAdminCurriculumItemsInputSchema.parse(input);

  const conditions = [eq(learningItems.languageId, languageId)];
  if (levelId) conditions.push(eq(learningItems.levelId, levelId));
  if (type) conditions.push(eq(learningItems.type, type));
  if (status === "draft") {
    // "draft" never appears literally in `learning_items.status` (see that
    // column's own comment) — it's a published item with an open,
    // unpublished edit, so the filter maps to the same condition the
    // display-status computation above uses.
    conditions.push(
      and(
        eq(learningItems.status, "published"),
        isNotNull(curriculumItemDrafts.id),
      )!,
    );
  } else if (status) {
    conditions.push(eq(learningItems.status, status));
  }
  if (groupId) conditions.push(eq(ITEM_GROUP_ID, groupId));
  if (needs) conditions.push(needsFilterCondition(needs));

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(vocabularyItems.term, pattern),
        ilike(vocabularyItems.primaryMeaning, pattern),
        ilike(
          sql`(${vocabularyItems.article} || ' ' || ${vocabularyItems.term})`,
          pattern,
        ),
        ilike(grammarItems.structure, pattern),
        ilike(grammarItems.primaryMeaning, pattern),
        ilike(grammarItems.explanation, pattern),
      )!,
    );
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    conditions.push(
      or(
        gt(levels.levelNumber, decoded.levelNumber),
        and(
          eq(levels.levelNumber, decoded.levelNumber),
          gt(learningItems.position, decoded.position),
        ),
        and(
          eq(levels.levelNumber, decoded.levelNumber),
          eq(learningItems.position, decoded.position),
          gt(learningItems.id, decoded.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select(SELECTION)
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(
      vocabularyItems,
      eq(vocabularyItems.learningItemId, learningItems.id),
    )
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .leftJoin(vocabularyGroups, eq(vocabularyGroups.id, ITEM_GROUP_ID))
    .leftJoin(
      curriculumItemDrafts,
      eq(curriculumItemDrafts.learningItemId, learningItems.id),
    )
    .where(and(...conditions))
    .orderBy(
      asc(levels.levelNumber),
      asc(learningItems.position),
      asc(learningItems.id),
    )
    // Fetch one extra row to know whether a next page exists, without a separate count query.
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toAdminCurriculumListItem),
    nextCursor:
      hasNextPage && last
        ? encodeCursor({
            levelNumber: last.levelNumber,
            position: last.position,
            id: last.id,
          })
        : null,
  };
}

/**
 * Spec 25 §16 — "Previous"/"Next"/"Next Incomplete Item". One row, same
 * filter shape and ordering key `getAdminCurriculumItems` itself uses, so
 * "the next item" always means the same thing the list view would show
 * next — never a separately-derived notion of order. `anyIncomplete` (Next
 * Incomplete Item) takes priority over `needs` if a caller somehow sets
 * both; in practice a caller picks one.
 */
export async function getAdjacentAdminCurriculumItem(
  db: DbClient,
  input: {
    languageId: string;
    levelId?: string;
    type?: "vocabulary" | "grammar";
    status?: CurriculumStatus;
    groupId?: string;
    search?: string;
    needs?: AdminCurriculumNeedsFilter;
    currentLevelNumber: number;
    currentPosition: number;
    currentId: string;
    direction: "next" | "previous";
    anyIncomplete?: boolean;
  },
): Promise<AdjacentAdminCurriculumItem> {
  const parsed = getAdjacentAdminCurriculumItemInputSchema.parse(input);

  const conditions = [eq(learningItems.languageId, parsed.languageId)];
  if (parsed.levelId)
    conditions.push(eq(learningItems.levelId, parsed.levelId));
  if (parsed.type) conditions.push(eq(learningItems.type, parsed.type));
  if (parsed.status === "draft") {
    conditions.push(
      and(
        eq(learningItems.status, "published"),
        isNotNull(curriculumItemDrafts.id),
      )!,
    );
  } else if (parsed.status) {
    conditions.push(eq(learningItems.status, parsed.status));
  }
  if (parsed.groupId) conditions.push(eq(ITEM_GROUP_ID, parsed.groupId));
  if (parsed.search) {
    const pattern = `%${parsed.search}%`;
    conditions.push(
      or(
        ilike(vocabularyItems.term, pattern),
        ilike(vocabularyItems.primaryMeaning, pattern),
        ilike(
          sql`(${vocabularyItems.article} || ' ' || ${vocabularyItems.term})`,
          pattern,
        ),
        ilike(grammarItems.structure, pattern),
        ilike(grammarItems.primaryMeaning, pattern),
        ilike(grammarItems.explanation, pattern),
      )!,
    );
  }
  if (parsed.anyIncomplete) conditions.push(ANY_INCOMPLETE);
  else if (parsed.needs) conditions.push(needsFilterCondition(parsed.needs));

  const { currentLevelNumber, currentPosition, currentId } = parsed;
  const isNext = parsed.direction === "next";
  const cmp = isNext ? gt : lt;
  conditions.push(
    or(
      cmp(levels.levelNumber, currentLevelNumber),
      and(
        eq(levels.levelNumber, currentLevelNumber),
        cmp(learningItems.position, currentPosition),
      ),
      and(
        eq(levels.levelNumber, currentLevelNumber),
        eq(learningItems.position, currentPosition),
        cmp(learningItems.id, currentId),
      ),
    )!,
  );

  const [row] = await db
    .select({ id: learningItems.id })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(
      vocabularyItems,
      eq(vocabularyItems.learningItemId, learningItems.id),
    )
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .leftJoin(
      curriculumItemDrafts,
      eq(curriculumItemDrafts.learningItemId, learningItems.id),
    )
    .where(and(...conditions))
    .orderBy(
      isNext ? asc(levels.levelNumber) : desc(levels.levelNumber),
      isNext ? asc(learningItems.position) : desc(learningItems.position),
      isNext ? asc(learningItems.id) : desc(learningItems.id),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Spec 25 §15's per-level editorial summary. One query, `GROUP BY` nothing —
 * every count is its own conditional aggregate over the same row set, since
 * an item can count toward several "needs" at once (this is a work-queue
 * summary, not a partition).
 */
export async function getLevelContentSummary(
  db: DbClient,
  input: { languageId: string; levelId: string },
): Promise<AdminLevelContentSummary> {
  const { languageId, levelId } =
    getLevelContentSummaryInputSchema.parse(input);

  const [row] = await db
    .select({
      totalItems: sql<number>`count(*)::int`,
      metadataCompleteCount: sql<number>`count(*) filter (where not (${ANY_INCOMPLETE}))::int`,
      needsDefinitionCount: sql<number>`count(*) filter (where ${NEEDS_DEFINITION})::int`,
      needsExamplesCount: sql<number>`count(*) filter (where ${NEEDS_EXAMPLES})::int`,
      needsIpaCount: sql<number>`count(*) filter (where ${NEEDS_IPA})::int`,
      needsPronunciationCount: sql<number>`count(*) filter (where ${NEEDS_PRONUNCIATION})::int`,
      needsSynonymsCount: sql<number>`count(*) filter (where ${NEEDS_SYNONYMS})::int`,
      needsVariationsCount: sql<number>`count(*) filter (where ${NEEDS_VARIATIONS})::int`,
      draftChangesCount: sql<number>`count(*) filter (where ${learningItems.status} = 'published' and ${curriculumItemDrafts.id} is not null)::int`,
    })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(
      vocabularyItems,
      eq(vocabularyItems.learningItemId, learningItems.id),
    )
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .leftJoin(
      curriculumItemDrafts,
      eq(curriculumItemDrafts.learningItemId, learningItems.id),
    )
    .where(
      and(
        eq(learningItems.languageId, languageId),
        eq(learningItems.levelId, levelId),
      ),
    );

  return (
    row ?? {
      totalItems: 0,
      metadataCompleteCount: 0,
      needsDefinitionCount: 0,
      needsExamplesCount: 0,
      needsIpaCount: 0,
      needsPronunciationCount: 0,
      needsSynonymsCount: 0,
      needsVariationsCount: 0,
      draftChangesCount: 0,
    }
  );
}

/** Per-status counts for one language (Unit 1's Overview stat cards). */
export async function getAdminCurriculumStatusCounts(
  db: DbClient,
  languageId: string,
): Promise<AdminCurriculumStatusCounts> {
  const rows = await db
    .select({ status: learningItems.status, count: sql<number>`count(*)::int` })
    .from(learningItems)
    .where(eq(learningItems.languageId, languageId))
    .groupBy(learningItems.status);

  const counts: AdminCurriculumStatusCounts = {
    draft: 0,
    pending: 0,
    published: 0,
    archived: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

/**
 * Everything waiting for an Admin to verify it (spec 17): items that have
 * never been published, and open drafts against items that have.
 *
 * One query per kind rather than a union — they are genuinely different
 * things (a whole new item versus an edit to a live one), and an Admin
 * deciding needs to see which is which. Authors come back as ids; the page
 * resolves them to names through `domains/users`, which owns that.
 */
export type ReviewQueueEntry = {
  learningItemId: string;
  kind: "new" | "edit";
  type: "vocabulary" | "grammar";
  itemLabel: string;
  meaningLabel: string;
  levelNumber: number;
  groupName: string | null;
  authorUserId: string | null;
  updatedAt: Date;
  version: number;
};

export async function getReviewQueue(
  db: DbClient,
  languageId: string,
): Promise<ReviewQueueEntry[]> {
  const base = db
    .select({
      learningItemId: learningItems.id,
      type: learningItems.type,
      status: learningItems.status,
      levelNumber: levels.levelNumber,
      version: learningItems.version,
      updatedAt: learningItems.updatedAt,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      vocabularyMeaning: vocabularyItems.primaryMeaning,
      groupName: vocabularyGroups.name,
      structure: grammarItems.structure,
      grammarMeaning: grammarItems.primaryMeaning,
      draftCreatedBy: curriculumItemDrafts.createdBy,
      draftUpdatedAt: curriculumItemDrafts.updatedAt,
    })
    .from(learningItems)
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .leftJoin(
      vocabularyItems,
      eq(vocabularyItems.learningItemId, learningItems.id),
    )
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .leftJoin(vocabularyGroups, eq(vocabularyGroups.id, ITEM_GROUP_ID))
    .leftJoin(
      curriculumItemDrafts,
      eq(curriculumItemDrafts.learningItemId, learningItems.id),
    );

  const rows = await base.where(
    and(
      eq(learningItems.languageId, languageId),
      or(
        eq(learningItems.status, "pending"),
        isNotNull(curriculumItemDrafts.id),
      ),
    ),
  );

  return rows
    .filter((row) => row.status !== "archived")
    .map((row) => ({
      learningItemId: row.learningItemId,
      kind: row.draftCreatedBy ? ("edit" as const) : ("new" as const),
      type: row.type,
      itemLabel:
        row.type === "vocabulary"
          ? row.article
            ? `${row.article} ${row.term}`
            : (row.term ?? "")
          : (row.structure ?? ""),
      meaningLabel:
        (row.type === "vocabulary"
          ? row.vocabularyMeaning
          : row.grammarMeaning) ?? "",
      levelNumber: row.levelNumber,
      groupName: row.groupName,
      authorUserId: row.draftCreatedBy,
      updatedAt: row.draftUpdatedAt ?? row.updatedAt,
      version: row.version,
    }))
    .sort(
      (a, b) =>
        a.levelNumber - b.levelNumber || a.itemLabel.localeCompare(b.itemLabel),
    );
}
