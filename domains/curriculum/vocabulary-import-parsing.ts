import type {
  AcceptedAnswerInput,
  GrammarFieldsInput,
  VocabularyFieldsInput,
} from "./curriculum-mutation-types";

/**
 * Column contract and per-row shape validation for a bulk curriculum
 * CSV/TSV upload. Pure and database-free, and deliberately free of
 * `csv-parse` too (that lives in `./vocabulary-import-file-parser.ts`
 * instead) — this file's constants and types are safe for a client
 * component to import (the upload UI shows the expected columns), which a
 * Node-oriented parsing library isn't worth risking in a client bundle for.
 *
 * Column headers are matched case/whitespace-insensitively (`word`,
 * `Word`, and `Word ` all resolve the same field) since spreadsheet exports
 * vary, and a short fixed list of synonyms is accepted for the group column
 * (`IMPORT_COLUMN_ALIASES` below). The column *set* itself is still fixed —
 * there's no column-mapping UI, and building one would be unrequested
 * scope.
 *
 * 2026-09-08 rewrite ("make importing easier"): only `word`, `translation`,
 * `level`, and `group` are required — `part_of_speech` moved from required
 * to optional, and level/group are no longer chosen once for the whole
 * file via a picker; every row now carries its own. `level` is the plain
 * level number (matching how an admin already thinks of "Level 3", not a
 * UUID); `group` is the group's position *within that level* — every
 * level's own vocabulary groups are numbered 1, 2, 3… by
 * `vocabulary_groups.position`, and this reuses that number directly
 * rather than inventing a second numbering scheme. `GRAMMAR_GROUP_NUMBER`
 * is a deliberate sentinel: grammar items have no group at all in the
 * schema, so one out-of-range group number (one past the realistic
 * vocabulary-group count) doubles as "this row is grammar, not
 * vocabulary" — see `MAX_VOCABULARY_GROUP_NUMBER`'s value, chosen to match
 * `CURRICULUM_VALIDATION_CONFIG`'s own default of 4 groups per level.
 *
 * Spec 25 Unit 2 (2026-09-27) adds the canonical CSV schema's remaining
 * columns as an *extension*, never a replacement — every file that already
 * satisfies the rules above keeps parsing exactly as it always has:
 *
 * - `item_type` (alias `type`): an explicit "vocabulary"/"grammar" column.
 *   When present and valid it decides the row's type outright and the
 *   `group`/`batch_number` cell is no longer read as a sentinel — see
 *   `MAX_VOCABULARY_GROUP_NUMBER`'s own note below for what that unlocks.
 *   Omitted entirely (as every pre-existing file is), the old
 *   `GRAMMAR_GROUP_NUMBER` sentinel decides exactly as before.
 * - `curriculum_key`: parsed and carried onto `ParsedImportFields` as a plain
 *   pass-through string. As of spec 25 Unit 4 (2026-09-28), when supplied it
 *   is the *primary* match key `domains/admin/bulk-import-service.ts`'s
 *   `resolveImportRow` uses to find the existing item this row means — see
 *   that file, since matching itself needs the database and stays out of
 *   this one.
 * - `level_name`, `batch_name` (alias for `group_name`): parsed and carried
 *   onto `ParsedImportFields`, consumed by spec 25 Unit 3's automatic
 *   Level/group creation (`domains/admin/bulk-import-service.ts`).
 * - `language`: validated against the import's own target language, not
 *   here (this file stays database-free) — see
 *   `domains/admin/bulk-import-service.ts`'s `resolveImportRow`.
 * - `synonyms`/`variations` (vocabulary only): spec 25 §8's pipe-delimited
 *   multi-value format (`parseMultiValueList`), merged into
 *   `acceptedAnswers` as `meaning`/`term` side answers respectively —
 *   `synonyms` are extra accepted English meanings, `variations` are extra
 *   accepted spellings of the target word itself (mirrors
 *   `AcceptedAnswerInput`'s existing `side` distinction).
 * - `tags`: named in the spec's canonical schema but has no backing column
 *   anywhere in the curriculum schema or `project-overview.md`'s documented
 *   vocabulary-item fields. Deliberately **not** implemented — inventing a
 *   tags data model would be a new product/architecture decision this unit
 *   has no basis for making (`ai-workflow-rules.md`). A file containing a
 *   `tags` column still parses fine (it's simply not a required column and
 *   nothing rejects unrecognized headers); the value is just never applied
 *   to anything. Recorded as an open question in `progress-tracker.md`.
 *
 * Spec 25 Unit 4 (2026-09-28) adds two more things, both database-free and
 * so both belonging in this file:
 *
 * - **Explicit clearing** (spec §7.4): a clearable optional cell —
 *   `article`/`definition`/`pronunciation`/`ipa`/`context`/`creator_notes`
 *   for vocabulary, `creator_notes` for grammar — holding exactly
 *   `__CLEAR__` (case-insensitive, `CLEAR_SENTINEL`) parses to `null`,
 *   distinct from an absent/blank cell (`undefined`, "say nothing about
 *   this field," unchanged from Units 1-3). `null` survives onto
 *   `ParsedImportFields` and all the way to `bulk-import-service.ts`'s
 *   diff, which is the only place `null` vs `undefined` actually matters:
 *   `null` proposes *clearing* the field, `undefined` proposes nothing.
 *   `word`/`translation`/`level`/`group`/`part_of_speech` (required, or
 *   defaulted rather than nullable) and `title`/`category` (no CSV column
 *   feeds them at all yet) are deliberately not clearable.
 * - **Rename support**: `word`/`translation` were always required, but nothing
 *   before this unit let a re-import actually change a vocabulary item's own
 *   `term` or a grammar item's own `structure` — matching was by spelling, so
 *   a changed spelling just looked like a different word entirely. Now that
 *   `curriculum_key` can be the match (see below), a row can rename the word
 *   itself, so `term`/`structure` need to be diffable like any other field —
 *   see `bulk-import-service.ts`'s `IMPORTABLE_FIELDS`.
 *
 * Spec 25 Unit 5 (2026-09-28) adds one more `curriculum_key` behavior, also
 * database-free: a cell holding exactly `NEW_HOMONYM_SENTINEL` parses to
 * `forceNewHomonym: true` (and `curriculumKey: null`, never both) — spec
 * §10.1's explicit, auditable "create a legitimate separate homonym" escape
 * hatch, consumed by `bulk-import-service.ts`'s `resolveImportRow`. This is
 * never present in an admin's own authored file; it only ever arrives via a
 * `curriculum_import_row_corrections` correction overlaid onto the raw row
 * before this function ever sees it (see `import-resolution.ts`'s
 * `resolveFreshImport`).
 */

export const REQUIRED_IMPORT_COLUMNS = [
  "word",
  "translation",
  "level",
  "group",
] as const;
const OPTIONAL_IMPORT_COLUMNS = [
  "part_of_speech",
  "article",
  "definition",
  "pronunciation",
  "ipa",
  "context",
  "creator_notes",
  // Spec 25 Unit 2's canonical-schema extension — see this file's own
  // top-of-file docstring for what each one does.
  "item_type",
  "curriculum_key",
  "language",
  "level_name",
  "group_name",
  "synonyms",
  "variations",
] as const;
export const IMPORT_COLUMNS = [
  ...REQUIRED_IMPORT_COLUMNS,
  ...OPTIONAL_IMPORT_COLUMNS,
] as const;
type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/**
 * Accepted spellings of a canonical column header, applied after the
 * case/whitespace normalization above (spec 16, 2026-09-08). The authored
 * Level 1 curriculum file names its group column `batch_id` — the same
 * concept under the word the curriculum author already uses for it — so
 * rejecting the file would mean hand-editing a header on every future
 * authored level rather than accepting a synonym once.
 *
 * Deliberately narrow: only columns with a real competing name in files
 * this project actually authors, or in spec 25's own canonical schema, get
 * an alias. This is not a general column-mapping layer, and it must never
 * map two different source columns onto the same canonical one in a single
 * file — the last header simply wins, exactly as a literal duplicate header
 * already would. `batch_number`/`batch_name` are spec 25's own canonical
 * names for what this codebase has always called `group`/`group_name`; the
 * internal name is kept (a rename touches the DB-persisted
 * `curriculum_import_rows.group_number` column and every reader of it for
 * no behavioral gain) and the spec's header spelling is accepted as a
 * synonym, exactly like `batch`/`batch_id` already are.
 */
export const IMPORT_COLUMN_ALIASES: Readonly<Record<string, ImportColumn>> = {
  batch: "group",
  batch_id: "group",
  batch_number: "group",
  group_id: "group",
  group_number: "group",
  batch_name: "group_name",
  type: "item_type",
};

/**
 * The highest group number this file format treats as a vocabulary group
 * **when `item_type` is absent** (sentinel mode — see the file's top-of-file
 * docstring). A convention of the sentinel scheme, not a limit on the
 * curriculum: a level may hold any number of groups (spec 17). What this
 * fixes is where the grammar sentinel sits, so the meaning of a `group` cell
 * never shifts under an already-authored sentinel-mode file.
 *
 * Once a row carries an explicit `item_type`, this cap no longer applies —
 * there is no sentinel value to protect, so `group`/`batch_number` for an
 * explicit vocabulary row accepts any positive integer, matching
 * architecture.md's "Level Shape" (levels are flexible; nothing caps their
 * group count).
 */
export const MAX_VOCABULARY_GROUP_NUMBER = 4;
/** One past the last real vocabulary group number — a row with this group value has no group at all; it's a grammar item. Sentinel-mode only, per the above. */
export const GRAMMAR_GROUP_NUMBER = MAX_VOCABULARY_GROUP_NUMBER + 1;

/**
 * A file large enough to need this feature is still a hand-authored
 * spreadsheet, not a data pipe — bounded generously, not unbounded. Values
 * match spec 19 §4's stated V1 limits ("Maximum file size: 5 MB, Maximum
 * rows: 5,000"), which both the synchronous web path and the future Lambda
 * worker must enforce identically.
 */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type ImportDelimiter = "," | "\t";
export type RawVocabularyImportRow = Record<string, string>;
export type ImportFileParseError =
  | { type: "unparseable"; message: string }
  | { type: "missing_columns"; columns: string[] }
  | { type: "too_many_rows"; count: number };
export type ImportFileParseResult =
  | { ok: true; rows: RawVocabularyImportRow[] }
  | { ok: false; error: ImportFileParseError };

export type ImportRowFieldIssue = { field: ImportColumn; message: string };

/**
 * Everything a vocabulary row contributes except `vocabularyGroupId` — the
 * actual group id can only be resolved against the database (this file
 * stays pure), so `levelNumber`/`groupNumber` travel instead, and
 * `domains/admin/bulk-import-service.ts` resolves them into a real
 * `vocabularyGroupId` once it knows the target language.
 *
 * `curriculumKey`/`levelName`/`groupName` (spec 25 Unit 2) are plain
 * pass-through values — `null` when the column is absent/blank — carried
 * for a later unit to read; nothing in this file or `bulk-import-service.ts`
 * uses them yet.
 */
export type ParsedVocabularyFields = Omit<
  VocabularyFieldsInput,
  "vocabularyGroupId"
> & {
  itemType: "vocabulary";
  levelNumber: number;
  groupNumber: number;
  curriculumKey: string | null;
  levelName: string | null;
  groupName: string | null;
  forceNewHomonym: boolean;
};

/** Grammar has no group at all — only `levelNumber` needs later resolution. */
export type ParsedGrammarFields = GrammarFieldsInput & {
  itemType: "grammar";
  levelNumber: number;
  curriculumKey: string | null;
  levelName: string | null;
  forceNewHomonym: boolean;
};

export type ParsedImportFields = ParsedVocabularyFields | ParsedGrammarFields;

/**
 * Spec 25 §8's canonical multi-value cell format (`term one|term two|term
 * three`), used by `synonyms`/`variations`. Trims each entry, drops entries
 * that are blank after trimming (a stray `a||b` or trailing `|` produces no
 * empty accepted-answer value), removes exact duplicates while preserving
 * first-occurrence order, and never touches accents/diacritics — `"sí|si"`
 * stays two distinct entries, exactly as the rest of this codebase treats
 * accented and unaccented Spanish as different words.
 */
export function parseMultiValueList(raw: string | undefined): string[] {
  const value = emptyToUndefined(raw);
  if (!value) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split("|")) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export type ValidatedImportRow = {
  rowNumber: number;
  raw: RawVocabularyImportRow;
  /** `null` when a required field is missing/blank/malformed — nothing else about this row (duplicates included) is worth checking until that's fixed in the source file. */
  fields: ParsedImportFields | null;
  fieldIssues: ImportRowFieldIssue[];
};

/**
 * A spreadsheet's placeholder for "doesn't apply" (`N/A`, any case) is
 * exactly as absent as a truly blank cell — without this, an authored file
 * that writes `N/A` in `article` for e.g. numerals stores the literal string
 * "N/A" as the word's article, and every place that composes "article +
 * term" for display (`level-view.ts`, `deck-practice.ts`, ...) prints "N/A
 * cero" instead of "cero".
 */
function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "n/a") return undefined;
  return trimmed;
}

/** Spec 25 §7.4's literal sentinel for explicitly clearing a field, distinct from an absent/blank cell. */
export const CLEAR_SENTINEL = "__CLEAR__";

/**
 * Spec 25 §10.1's "Explicitly create a legitimate separate homonym" — a
 * `curriculum_key` cell holding exactly this sentinel (case-insensitive)
 * means the opposite of a real key: skip matching entirely (by key *and* by
 * spelling) and create a brand-new item even though one with the same term
 * already exists. `resolveImportRow` (`bulk-import-service.ts`) is the only
 * reader; a row's *real* `curriculumKey` is never set alongside this — see
 * `forceNewHomonym` on `ParsedImportFields`.
 *
 * This is an intentionally narrow escape hatch, not a general "always
 * create" flag: an ordinary re-import still treats one live exact-term match
 * as an update (spec 17's settled behavior — a plain file cannot express a
 * deliberate homonym, only this explicit per-row admin correction can, via
 * `curriculum_import_row_corrections`).
 */
export const NEW_HOMONYM_SENTINEL = "__NEW_HOMONYM__";

/**
 * Distinguishes "no info supplied" (blank/absent/N-A -> `undefined`, meaning
 * "don't touch this field," unchanged since Units 1-3) from "explicitly
 * clear this field" (the literal cell value `__CLEAR__`, case-insensitive ->
 * `null`) for one *clearable* optional cell (spec 25 §7.4). Only used for
 * fields where clearing existing content is a meaningful, supported
 * operation — see this file's top-of-file docstring for exactly which ones.
 */
function parseClearableCell(
  value: string | undefined,
): string | null | undefined {
  const trimmed = value?.trim();
  if (trimmed && trimmed.toUpperCase() === CLEAR_SENTINEL) return null;
  return emptyToUndefined(value);
}

/**
 * Row 1-indexed and offset by 1 to account for the header row, so
 * `rowNumber` matches what a spreadsheet editor would call it — the number
 * an admin actually sees when they go fix row 14 in their own file.
 */
export function validateVocabularyImportRow(
  raw: RawVocabularyImportRow,
  index: number,
): ValidatedImportRow {
  const rowNumber = index + 2;
  const fieldIssues: ImportRowFieldIssue[] = [];

  const word = emptyToUndefined(raw.word);
  const translation = emptyToUndefined(raw.translation);
  const levelRaw = emptyToUndefined(raw.level);
  const groupRaw = emptyToUndefined(raw.group);
  const itemTypeRaw = emptyToUndefined(raw.item_type);

  if (!word) fieldIssues.push({ field: "word", message: "Missing word." });
  if (!translation)
    fieldIssues.push({ field: "translation", message: "Missing translation." });

  let levelNumber = NaN;
  if (!levelRaw) {
    fieldIssues.push({ field: "level", message: "Missing level." });
  } else {
    levelNumber = Number(levelRaw);
    if (!Number.isInteger(levelNumber) || levelNumber < 1) {
      fieldIssues.push({
        field: "level",
        message: `"${levelRaw}" isn't a valid level number.`,
      });
    }
  }

  // An explicit `item_type` column (spec 25 Unit 2) decides the row's type
  // outright, in which case `group`/`batch_number` is no longer read as the
  // grammar sentinel below and its range cap no longer applies. Left
  // `undefined` when the column is absent, so every pre-existing
  // sentinel-only file validates byte-for-byte as it always has.
  let explicitItemType: "vocabulary" | "grammar" | undefined;
  if (itemTypeRaw !== undefined) {
    const normalized = itemTypeRaw.toLowerCase();
    if (normalized === "vocabulary" || normalized === "grammar") {
      explicitItemType = normalized;
    } else {
      fieldIssues.push({
        field: "item_type",
        message: `"${itemTypeRaw}" isn't a valid item type — use "vocabulary" or "grammar".`,
      });
    }
  }

  let groupNumber = NaN;
  if (!groupRaw) {
    fieldIssues.push({ field: "group", message: "Missing group." });
  } else {
    groupNumber = Number(groupRaw);
    if (explicitItemType) {
      if (!Number.isInteger(groupNumber) || groupNumber < 1) {
        fieldIssues.push({
          field: "group",
          message: `"${groupRaw}" isn't a valid batch number.`,
        });
      }
    } else if (
      !Number.isInteger(groupNumber) ||
      groupNumber < 1 ||
      groupNumber > GRAMMAR_GROUP_NUMBER
    ) {
      fieldIssues.push({
        field: "group",
        message: `Group must be 1-${MAX_VOCABULARY_GROUP_NUMBER} (vocabulary) or ${GRAMMAR_GROUP_NUMBER} (grammar).`,
      });
    }
  }

  if (fieldIssues.length > 0) {
    return { rowNumber, raw, fields: null, fieldIssues };
  }

  // `word`/`translation` are guaranteed defined here — any missing/blank
  // value already returned above via `fieldIssues.length > 0`.
  const definiteWord = word!;
  const definiteTranslation = translation!;
  const rawCurriculumKey = emptyToUndefined(raw.curriculum_key) ?? null;
  const forceNewHomonym =
    rawCurriculumKey?.toUpperCase() === NEW_HOMONYM_SENTINEL;
  const curriculumKey = forceNewHomonym ? null : rawCurriculumKey;
  const levelName = emptyToUndefined(raw.level_name) ?? null;

  const itemType =
    explicitItemType ??
    (groupNumber === GRAMMAR_GROUP_NUMBER ? "grammar" : "vocabulary");

  if (itemType === "grammar") {
    const fields: ParsedGrammarFields = {
      itemType: "grammar",
      levelNumber,
      curriculumKey,
      levelName,
      forceNewHomonym,
      title: null,
      structure: definiteWord,
      primaryMeaning: definiteTranslation,
      // Left blank on purpose — the real teaching explanation is written
      // afterward in Admin, not guessed from a two-column spreadsheet row.
      explanation: "",
      category: null,
      creatorNotes: parseClearableCell(raw.creator_notes),
      requiredQuestions: [
        { format: "translation", direction: "targetToEnglish" },
      ],
      acceptedAnswers: [],
    };
    return { rowNumber, raw, fields, fieldIssues: [] };
  }

  // Spec 25 §8: `synonyms` are extra accepted English meanings (the
  // `meaning` side), `variations` are extra accepted spellings of the target
  // word itself (the `term` side) — the same side distinction
  // `AcceptedAnswerInput`/`user_synonyms` already use.
  const acceptedAnswers: AcceptedAnswerInput[] = [
    ...parseMultiValueList(raw.synonyms).map((value): AcceptedAnswerInput => ({
      side: "meaning",
      value,
    })),
    ...parseMultiValueList(raw.variations).map(
      (value): AcceptedAnswerInput => ({ side: "term", value }),
    ),
  ];

  const fields: ParsedVocabularyFields = {
    itemType: "vocabulary",
    levelNumber,
    groupNumber,
    curriculumKey,
    levelName,
    forceNewHomonym,
    groupName: emptyToUndefined(raw.group_name) ?? null,
    term: definiteWord,
    primaryMeaning: definiteTranslation,
    partOfSpeech: emptyToUndefined(raw.part_of_speech) ?? "",
    article: parseClearableCell(raw.article),
    definition: parseClearableCell(raw.definition),
    pronunciation: parseClearableCell(raw.pronunciation),
    ipa: parseClearableCell(raw.ipa),
    context: parseClearableCell(raw.context),
    creatorNotes: parseClearableCell(raw.creator_notes),
    acceptedAnswers,
  };

  return { rowNumber, raw, fields, fieldIssues: [] };
}
