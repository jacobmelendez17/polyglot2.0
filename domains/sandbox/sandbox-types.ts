import type { SrsStage } from "@/domains/srs";

/**
 * Spec 11 rewrite's "Developer Sandbox" — a real `users` row
 * (`is_sandbox = true`, `clerk_user_id = null`, one per owner) whose
 * progress lives in the exact same `user_item_progress`/`user_level_progress`
 * tables real learners use, isolated purely by that row's own identity
 * (architecture.md's ADR-020, and the spec's own "Do not add is_sandbox
 * flags throughout progress tables"). Nothing here is a parallel schema.
 */
export type SandboxAccount = {
  sandboxUserId: string;
  ownerUserId: string;
  languageId: string;
};

export type SandboxLevelState = {
  levelId: string;
  levelNumber: number;
  levelName: string | null;
  unlockedAt: Date;
};

export type SandboxItemState = {
  learningItemId: string;
  itemLabel: string;
  levelNumber: number;
  srsStage: SrsStage;
  nextReviewAt: Date | null;
};

export type SandboxSnapshot = {
  account: SandboxAccount;
  unlockedLevels: SandboxLevelState[];
  items: SandboxItemState[];
};
