import type { CurriculumStatus } from "./curriculum-db-types";

/**
 * One row of the Admin curriculum table (spec 11 §9). `itemLabel` is the
 * primary display text — the article-composed vocabulary form ("el gato")
 * or the grammar structure ("porque") — and `meaningLabel` its short
 * translation, computed server-side so no admin UI component re-derives a
 * Spanish article itself (same principle as `domains/curriculum/level-view.ts`).
 * Grammar items have no group (`groupId`/`groupName` are `null`), matching
 * the mockup's "—" column.
 */
export type AdminCurriculumListItem = {
  id: string;
  type: "vocabulary" | "grammar";
  status: CurriculumStatus;
  languageId: string;
  levelId: string;
  levelNumber: number;
  position: number;
  itemLabel: string;
  meaningLabel: string;
  groupId: string | null;
  groupName: string | null;
  updatedAt: Date;
};

/**
 * Spec 11 §10's minimum filter set. `languageId` is required — admin
 * curriculum browsing is always scoped to one language at a time (spec 11
 * §11's "search must be language-scoped"), never a cross-language listing.
 */
export type AdminCurriculumFilters = {
  languageId: string;
  levelId?: string;
  type?: "vocabulary" | "grammar";
  status?: CurriculumStatus;
  groupId?: string;
  /** Substring match, case-insensitive, accent-preserving (spec 11 §11) — never erases diacritics. */
  search?: string;
};

export type GetAdminCurriculumItemsInput = AdminCurriculumFilters & {
  limit: number;
  /** Opaque cursor from a previous page's `nextCursor`; omit for the first page. */
  cursor?: string | null;
};

export type AdminCurriculumItemsPage = {
  items: AdminCurriculumListItem[];
  /** Opaque cursor for the next page, or `null` when this page is the last. */
  nextCursor: string | null;
};

/** Per-status item counts for one language (Unit 1's Overview stat cards). */
export type AdminCurriculumStatusCounts = Record<CurriculumStatus, number>;
