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
  /**
   * Spec 25 §15's editorial work-queue flags — independent of publication
   * status, so a `published` item can still show up needing a definition.
   * `false` for a field that doesn't apply to this item's type (a grammar
   * item has no IPA/pronunciation/variations at all — see
   * `curriculum-admin-repository.ts`'s `SELECTION` for exactly which raw
   * columns each flag reads).
   */
  needsDefinition: boolean;
  needsExamples: boolean;
  needsIpa: boolean;
  needsPronunciation: boolean;
  needsSynonyms: boolean;
  needsVariations: boolean;
};

/**
 * Spec 25 §15's filter list, minus "Has Validation Warning" and "Recently
 * Imported" — neither has a backing data source yet (no per-item validation-
 * warning state exists anywhere, and no column records whether/when an item
 * came from a CSV import), so adding either would mean inventing new product
 * state rather than wiring up something that already exists. Recorded as an
 * open question in `progress-tracker.md` rather than faked with a proxy.
 */
export type AdminCurriculumNeedsFilter =
  | "definition"
  | "examples"
  | "ipa"
  | "pronunciation"
  | "synonyms"
  | "variations"
  | "draft_changes"
  | "ready_to_publish";

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
  /** Spec 25 §15 — independent of, and combinable with, `status` above (e.g. "published items needing a definition"). */
  needs?: AdminCurriculumNeedsFilter;
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

/**
 * Spec 25 §15's per-level editorial summary ("60 items, 58 metadata-complete,
 * 24 need definitions, 31 need examples..."). Deliberately omits the spec's
 * "warnings"/"blocking conflicts" pair — see `AdminCurriculumNeedsFilter`'s
 * own docstring for why neither has a backing data source yet.
 */
export type AdminLevelContentSummary = {
  totalItems: number;
  metadataCompleteCount: number;
  needsDefinitionCount: number;
  needsExamplesCount: number;
  needsIpaCount: number;
  needsPronunciationCount: number;
  needsSynonymsCount: number;
  needsVariationsCount: number;
  draftChangesCount: number;
};

/** Spec 25 §16 — the item immediately after/before a given item in the *same* filtered/sorted view `getAdminCurriculumItems` produces, for "Previous"/"Next"/"Next Incomplete Item". `null` when there is none (already first/last, or nothing else matches). */
export type AdjacentAdminCurriculumItem = { id: string } | null;
