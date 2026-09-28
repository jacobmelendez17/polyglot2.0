export type SendCommitJobInput = { importId: string; actorUserId: string };
export type SendPreviewJobInput = { bucket: string; key: string };

/**
 * Queue boundary for the curriculum-import commit job (spec 19 §11/§14) and
 * the spec 25 §10.2 preview-retrigger job. Domain/application code expresses
 * intent — "commit this import," "re-preview this import" — through this
 * interface and never talks to the SQS SDK directly, the same shape as
 * `providers/storage`'s `CurriculumImportStorage`.
 */
export interface CurriculumImportQueue {
  sendCommitJob(input: SendCommitJobInput): Promise<void>;
  sendPreviewJob(input: SendPreviewJobInput): Promise<void>;
}
