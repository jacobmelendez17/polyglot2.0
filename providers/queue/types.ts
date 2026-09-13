export type SendCommitJobInput = { importId: string; actorUserId: string };

/**
 * Queue boundary for the curriculum-import commit job (spec 19 §11/§14).
 * Domain/application code expresses intent — "commit this import" — through
 * this interface and never talks to the SQS SDK directly, the same shape as
 * `providers/storage`'s `CurriculumImportStorage`.
 */
export interface CurriculumImportQueue {
  sendCommitJob(input: SendCommitJobInput): Promise<void>;
}
