import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { learningItemTypeEnum, learningItems } from "./curriculum";
import { languages } from "./languages";
import { users } from "./users";

/**
 * Spec 19 — asynchronous curriculum import processing state. One row per
 * uploaded CSV/TSV artifact. This table (and `curriculum_import_rows` below)
 * exists only to track and audit an import through its async Lambda
 * pipeline; it never becomes an alternate source of curriculum truth and
 * carries no business rules of its own — `domains/admin/bulk-import-service.ts`
 * remains the only place resolution/mutation logic lives (spec 19 §2).
 *
 * Ordered to match the state diagram in spec 19 §18: a row moves forward
 * through this list, with `failed` reachable from any in-flight state.
 */
export const curriculumImportStatusEnum = pgEnum("curriculum_import_status", [
  "uploading",
  "queued_for_preview",
  "previewing",
  "needs_review",
  "ready_to_import",
  "queued_for_import",
  "importing",
  "completed",
  "failed",
]);

/**
 * Reuses `bulk-import-service.ts`'s own `ImportRowAction` vocabulary
 * (`create`/`update`/`move`/`unchanged`/`blocked`) rather than inventing a
 * parallel one — spec 19 §2 forbids a second set of importer rules, and a
 * row's classification is exactly that resolver's output. `blocked` covers
 * both an unparseable row and a row the resolver cannot apply (spec 19's
 * "BLOCKED / NEEDS REVIEW" bucket); either way it needs an explicit admin
 * disposition before the import can be confirmed (spec 19 §9).
 */
export const curriculumImportRowClassificationEnum = pgEnum(
  "curriculum_import_row_classification",
  ["create", "update", "move", "unchanged", "blocked"],
);

/**
 * Version 1's only resolution for a blocked/needs-review row (spec 19 §9).
 * A single-value enum reads oddly today, but the column exists so a future
 * disposition (e.g. an explicit homonym approval) is an enum value, not a
 * schema change.
 */
export const curriculumImportRowDispositionEnum = pgEnum(
  "curriculum_import_row_disposition",
  ["skip"],
);

/**
 * Spec 19 §20. `environment` records the `APP_ENV` the import ran under —
 * informational only, since `architecture.md`'s environments are fully
 * separate databases and this table never spans more than one of them.
 * `source_import_id`/`source_sha256` support §29's development→production
 * promotion the same way: they name a row that lives in a *different*
 * database, so they are plain columns, never a foreign key.
 */
export const curriculumImports = pgTable(
  "curriculum_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    environment: text("environment").notNull(),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),

    originalFilename: text("original_filename").notNull(),
    fileExtension: text("file_extension").notNull(),
    s3Bucket: text("s3_bucket").notNull(),
    s3Key: text("s3_key").notNull(),
    // Nullable: the create-import Server Action knows the id and S3 key
    // before any bytes exist (spec 19 §6 — the browser uploads directly to
    // S3, never through Next.js), so the checksum genuinely isn't known
    // until the preview job actually reads the file. Filled in then.
    sourceSha256: text("source_sha256"),

    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    status: curriculumImportStatusEnum("status").notNull().default("uploading"),

    totalRows: integer("total_rows").notNull().default(0),
    createCount: integer("create_count").notNull().default(0),
    updateCount: integer("update_count").notNull().default(0),
    moveCount: integer("move_count").notNull().default(0),
    unchangedCount: integer("unchanged_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),

    // Bumped each time a preview is (re)computed (initial preview, and any
    // re-preview forced by §12's commit-time revalidation). `confirmedPreviewVersion`
    // records which version the admin actually confirmed, so a commit job can
    // tell a stale confirmation from the current preview apart.
    previewVersion: integer("preview_version").notNull().default(0),
    confirmedPreviewVersion: integer("confirmed_preview_version"),

    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorSummary: text("last_error_summary"),

    sourceImportId: uuid("source_import_id"),

    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    previewStartedAt: timestamp("preview_started_at", { withTimezone: true }),
    previewCompletedAt: timestamp("preview_completed_at", {
      withTimezone: true,
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    importStartedAt: timestamp("import_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),

    ...timestamps(),
  },
  (t) => [
    // Normal (non-archived) import history, newest first (spec 19 §19).
    index("curriculum_imports_history_idx")
      .on(t.languageId, t.createdAt.desc(), t.id.desc())
      .where(sql`${t.archivedAt} IS NULL`),
    // Archived-imports listing (spec 19 §25).
    index("curriculum_imports_archived_idx")
      .on(t.languageId, t.archivedAt.desc())
      .where(sql`${t.archivedAt} IS NOT NULL`),
    index("curriculum_imports_status_idx").on(t.status),
  ],
);

/**
 * Spec 19 §20. One row per parsed CSV/TSV line, kept only to review and
 * audit the import — never a copy of the raw file kept forever (§20's
 * "each preview row should retain only the information required to review
 * and audit the import rather than duplicating the entire source CSV").
 */
export const curriculumImportRows = pgTable(
  "curriculum_import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => curriculumImports.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),

    // Null when the row could not be parsed at all (a missing required
    // field), in which case `reviewReason` carries why.
    itemType: learningItemTypeEnum("item_type"),
    displayTerm: text("display_term"),

    levelNumber: integer("level_number"),
    groupNumber: integer("group_number"),

    classification:
      curriculumImportRowClassificationEnum("classification").notNull(),
    previousClassification: curriculumImportRowClassificationEnum(
      "previous_classification",
    ),

    resolvedLearningItemId: uuid("resolved_learning_item_id").references(
      () => learningItems.id,
      { onDelete: "set null" },
    ),

    // The ImportFieldChange[] shape (`{ field, from, to }`) from
    // `bulk-import-service.ts` — enough for a review screen to show what
    // would change, without a column per curriculum field.
    changedFields: jsonb("changed_fields"),

    reviewReasonCode: text("review_reason_code"),
    reviewReason: text("review_reason"),

    adminDisposition: curriculumImportRowDispositionEnum("admin_disposition"),

    changedSincePreview: boolean("changed_since_preview")
      .notNull()
      .default(false),

    ...timestamps(),
  },
  (t) => [
    unique("curriculum_import_rows_import_row_idx").on(t.importId, t.rowNumber),
    // Review-queue lookups: rows still needing an explicit disposition (spec 19 §9).
    index("curriculum_import_rows_review_idx").on(t.importId, t.classification),
  ],
);
