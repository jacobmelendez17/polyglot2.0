/**
 * Structured errors for the Lexicon domain (spec 12), following
 * architecture.md's `{ code, message }` model. Kept separate from
 * `admin-errors.ts`/`app-error.ts` for the same reason those are separate
 * from each other: this workflow's failure set is its own concern, and the
 * import half of it has no counterpart anywhere else in the application.
 *
 * Messages never carry a filesystem path, a connection string, a raw source
 * record, or an upstream parser error — spec 12's security section treats
 * imported files and JSON as untrusted, and an error message is one of the
 * easier places for untrusted content to escape into a log or a UI.
 */

export const LEXICON_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "LEXICAL_SOURCE_NOT_CONFIGURED",
  "VOCABULARY_ITEM_NOT_FOUND",
  "DICTIONARY_ENTRY_NOT_FOUND",
  "MAPPING_NOT_FOUND",
  "MAPPING_LOCKED",
  "SENSE_NOT_IN_MAPPED_ENTRY",
  "PRONUNCIATION_NOT_IN_MAPPED_ENTRY",
  "IMPORT_SOURCE_UNAVAILABLE",
  "IMPORT_VALIDATION_FAILED",
] as const;

export type LexiconErrorCode = (typeof LEXICON_ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<LexiconErrorCode, string> = {
  UNAUTHENTICATED: "You must be signed in to do that.",
  FORBIDDEN: "You don't have access to do that.",
  RATE_LIMITED: "Please slow down and try again shortly.",
  LEXICAL_SOURCE_NOT_CONFIGURED: "No dictionary source is configured for this language.",
  VOCABULARY_ITEM_NOT_FOUND: "That vocabulary item could not be found.",
  DICTIONARY_ENTRY_NOT_FOUND: "That dictionary entry could not be found.",
  MAPPING_NOT_FOUND: "This vocabulary item has no dictionary mapping yet.",
  MAPPING_LOCKED: "This mapping was set manually and cannot be replaced automatically.",
  SENSE_NOT_IN_MAPPED_ENTRY: "That definition doesn't belong to this item's mapped dictionary entry.",
  PRONUNCIATION_NOT_IN_MAPPED_ENTRY: "That pronunciation doesn't belong to this item's mapped dictionary entry.",
  IMPORT_SOURCE_UNAVAILABLE: "The configured dictionary source file could not be read.",
  IMPORT_VALIDATION_FAILED: "The dictionary source failed validation and was not applied.",
};

export class LexiconError extends Error {
  readonly code: LexiconErrorCode;
  /** Structured, safe-to-display context — never sensitive or upstream-supplied content. */
  readonly details?: unknown;

  constructor(code: LexiconErrorCode, message?: string, details?: unknown) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "LexiconError";
    this.details = details;
  }
}
