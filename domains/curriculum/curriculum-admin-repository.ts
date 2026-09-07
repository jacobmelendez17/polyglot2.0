import { and, asc, eq, gt, ilike, isNotNull, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { curriculumItemDrafts, grammarItems, learningItems, levels, vocabularyGroups, vocabularyItems } from "@/db/schema";

import { getAdminCurriculumItemsInputSchema } from "./curriculum-admin-schemas";
import type {
  AdminCurriculumListItem,
  AdminCurriculumItemsPage,
  AdminCurriculumStatusCounts,
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
    return row.vocabArticle ? `${row.vocabArticle} ${row.vocabTerm}` : row.vocabTerm;
  }
  return row.grammarStructure ?? "";
}

function computeMeaningLabel(row: { vocabMeaning: string | null; grammarMeaning: string | null }): string {
  return row.vocabMeaning ?? row.grammarMeaning ?? "";
}

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
  vocabGroupId: vocabularyItems.vocabularyGroupId,
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
} as const;

function computeDisplayStatus(status: CurriculumStatus, hasOpenDraft: string | null): CurriculumStatus {
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
  };
}

/** Opaque keyset cursor over `(level_number, position, id)`, all ascending — never expose raw ordering keys directly (code-standards.md's pagination rule). */
type Cursor = { levelNumber: number; position: number; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (typeof parsed?.levelNumber !== "number" || typeof parsed?.position !== "number" || typeof parsed?.id !== "string") {
    throw new Error("Invalid admin curriculum cursor");
  }
  return parsed;
}

export async function getAdminCurriculumItems(
  db: DbClient,
  input: GetAdminCurriculumItemsInput,
): Promise<AdminCurriculumItemsPage> {
  const { languageId, levelId, type, status, groupId, search, limit, cursor } =
    getAdminCurriculumItemsInputSchema.parse(input);

  const conditions = [eq(learningItems.languageId, languageId)];
  if (levelId) conditions.push(eq(learningItems.levelId, levelId));
  if (type) conditions.push(eq(learningItems.type, type));
  if (status === "draft") {
    // "draft" never appears literally in `learning_items.status` (see that
    // column's own comment) — it's a published item with an open,
    // unpublished edit, so the filter maps to the same condition the
    // display-status computation above uses.
    conditions.push(and(eq(learningItems.status, "published"), isNotNull(curriculumItemDrafts.id))!);
  } else if (status) {
    conditions.push(eq(learningItems.status, status));
  }
  if (groupId) conditions.push(eq(vocabularyItems.vocabularyGroupId, groupId));

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(vocabularyItems.term, pattern),
        ilike(vocabularyItems.primaryMeaning, pattern),
        ilike(sql`(${vocabularyItems.article} || ' ' || ${vocabularyItems.term})`, pattern),
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
        and(eq(levels.levelNumber, decoded.levelNumber), gt(learningItems.position, decoded.position)),
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
    .leftJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
    .leftJoin(vocabularyGroups, eq(vocabularyGroups.id, vocabularyItems.vocabularyGroupId))
    .leftJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
    .leftJoin(curriculumItemDrafts, eq(curriculumItemDrafts.learningItemId, learningItems.id))
    .where(and(...conditions))
    .orderBy(asc(levels.levelNumber), asc(learningItems.position), asc(learningItems.id))
    // Fetch one extra row to know whether a next page exists, without a separate count query.
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toAdminCurriculumListItem),
    nextCursor:
      hasNextPage && last
        ? encodeCursor({ levelNumber: last.levelNumber, position: last.position, id: last.id })
        : null,
  };
}

/** Per-status counts for one language (Unit 1's Overview stat cards). */
export async function getAdminCurriculumStatusCounts(db: DbClient, languageId: string): Promise<AdminCurriculumStatusCounts> {
  const rows = await db
    .select({ status: learningItems.status, count: sql<number>`count(*)::int` })
    .from(learningItems)
    .where(eq(learningItems.languageId, languageId))
    .groupBy(learningItems.status);

  const counts: AdminCurriculumStatusCounts = { draft: 0, pending: 0, published: 0, archived: 0 };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
