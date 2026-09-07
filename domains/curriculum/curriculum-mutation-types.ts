import type { LevelValidationTargets } from "./curriculum-validation-config";
import type { CurriculumGrammarQuestionRequirement, CurriculumStatus } from "./curriculum-db-types";

/** One official accepted-answer value on either side (mirrors `user_synonyms`' `side` distinction). */
export type AcceptedAnswerInput = { side: "term" | "meaning"; value: string };

export type VocabularyFieldsInput = {
  vocabularyGroupId: string;
  term: string;
  primaryMeaning: string;
  definition?: string | null;
  article?: string | null;
  partOfSpeech: string;
  pronunciation?: string | null;
  ipa?: string | null;
  context?: string | null;
  creatorNotes?: string | null;
  acceptedAnswers: AcceptedAnswerInput[];
};

export type GrammarFieldsInput = {
  title?: string | null;
  structure: string;
  primaryMeaning: string;
  explanation: string;
  category?: string | null;
  creatorNotes?: string | null;
  requiredQuestions: CurriculumGrammarQuestionRequirement[];
  acceptedAnswers: AcceptedAnswerInput[];
};

export type CreateLearningItemInput = {
  languageId: string;
  levelId: string;
  actorUserId: string;
  /** Confirms an already-flagged duplicate candidate is a deliberate, distinct sense — recorded on the audit event (spec 11 rewrite's homonym approval). */
  approvedAsHomonymOf?: string | null;
} & ({ type: "vocabulary"; fields: VocabularyFieldsInput } | { type: "grammar"; fields: GrammarFieldsInput });

export type UpdateLearningItemInput = {
  learningItemId: string;
  actorUserId: string;
  approvedAsHomonymOf?: string | null;
} & ({ type: "vocabulary"; fields: VocabularyFieldsInput } | { type: "grammar"; fields: GrammarFieldsInput });

export type PublishLearningItemInput = {
  learningItemId: string;
  actorUserId: string;
  /** The `learning_items.version` the admin last loaded — mismatch means someone else published first (`ADMIN_EDIT_CONFLICT`). */
  expectedVersion: number;
};

export type ArchiveLearningItemInput = { learningItemId: string; actorUserId: string; reason?: string };

/** Attempts a permanent delete; falls back to archive when referential integrity blocks it (spec 11 rewrite's Archive/Delete section) — the caller learns which happened via the result. */
export type DeleteLearningItemInput = { learningItemId: string; actorUserId: string };
export type DeleteLearningItemResult = { outcome: "deleted" } | { outcome: "archived"; reason: string };

export type MoveLearningItemInput = {
  learningItemId: string;
  actorUserId: string;
  levelId?: string;
  vocabularyGroupId?: string;
};

export type ReorderLearningItemsInput = {
  actorUserId: string;
  /** Every item being reordered must share the same level and type — `position` is only unique within `(level, type)`, so reordering never spans either. */
  levelId: string;
  type: "vocabulary" | "grammar";
  /** Full ordered list of learning-item IDs for this level+type, new position = array index + 1. */
  orderedLearningItemIds: string[];
};

/** A same-language, same-normalized-form item already on file (spec 11 rewrite's Duplicate Detection). */
export type DuplicateCandidate = {
  learningItemId: string;
  displayLabel: string;
  status: "draft" | "pending" | "published" | "archived";
};

// --- Levels / Vocabulary Groups management (spec 11 rewrite) ---

export type CreateLevelInput = {
  languageId: string;
  levelNumber: number;
  name?: string | null;
  actorUserId: string;
};

/** Setting `status: "published"` is rejected unless the level's curriculum counts satisfy `CURRICULUM_VALIDATION_CONFIG` (spec 11 rewrite's "Publishing should fail if mandatory Level validation is not satisfied"). */
export type UpdateLevelInput = {
  levelId: string;
  actorUserId: string;
  name?: string | null;
  status?: CurriculumStatus;
  /** Per-level curriculum targets. Omitted fields are left unchanged; `null` restores the configured default. */
  targets?: LevelValidationTargets;
};

export type CreateVocabularyGroupInput = {
  levelId: string;
  languageId: string;
  name: string;
  actorUserId: string;
};

export type UpdateVocabularyGroupInput = {
  groupId: string;
  actorUserId: string;
  name?: string;
  status?: CurriculumStatus;
};

export type ReorderVocabularyGroupsInput = {
  actorUserId: string;
  levelId: string;
  /** Full ordered list of vocabulary-group IDs within this level, new position = array index + 1. */
  orderedGroupIds: string[];
};

// --- Bulk actions on the curriculum table (spec 11 rewrite's "Bulk Actions" / "Bulk Publish") ---

export type BulkArchiveLearningItemsInput = { learningItemIds: string[]; actorUserId: string; reason?: string };

/** A move affecting several items at once — a grammar item in the selection is silently unaffected by `vocabularyGroupId` (grammar items have no group), matching `moveLearningItem`'s existing single-item behavior. */
export type BulkMoveLearningItemsInput = {
  learningItemIds: string[];
  actorUserId: string;
  levelId?: string;
  vocabularyGroupId?: string;
};

/** Every selected item must actually be `pending` — spec's literal "Pending items may be selected and published together." Transactional: all publish, or none do. */
export type BulkPublishPendingItemsInput = { learningItemIds: string[]; actorUserId: string };
