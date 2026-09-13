export type CreatePresignedUploadInput = {
  key: string;
  contentType: string;
  /** Defaults to a short-lived window (spec 19 §6/§45 — "presigned upload credentials must be short lived"). */
  expiresInSeconds?: number;
};

export type PresignedUpload = {
  url: string;
  bucket: string;
  key: string;
  expiresAt: Date;
};

/**
 * Storage boundary for curriculum-import source artifacts (spec 19 §6, §26,
 * §41). Domain/application code expresses intent through this interface and
 * never talks to the AWS S3 SDK directly — the same shape as
 * `providers/rate-limit`'s `RateLimiter` and `providers/speech`'s
 * recognition provider.
 */
export interface CurriculumImportStorage {
  readonly bucketName: string;
  createPresignedUploadUrl(input: CreatePresignedUploadInput): Promise<PresignedUpload>;
  /** Permanent-deletion support (spec 19 §26) — removes the source object if it still exists; never throws for an already-expired/missing object. */
  deleteObject(key: string): Promise<void>;
}
