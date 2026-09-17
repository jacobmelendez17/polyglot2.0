import { z } from "zod";

/**
 * Distinguishes the two message shapes this worker's one queue can carry
 * (spec 19 §30's "determine job type"):
 *
 * 1. A native S3 `ObjectCreated` event notification — arrives when the
 *    bucket's own notification configuration (§48 step 11) publishes
 *    directly to SQS. This is what triggers a **preview** job (§7); nothing
 *    adds a custom envelope around it, so it's recognized by its native
 *    shape rather than an explicit `jobType` field.
 * 2. A small custom envelope Next.js sends directly to SQS on Admin
 *    confirmation (§11) — `{ version, jobType: "COMMIT_IMPORT", importId,
 *    actorUserId }`. Not yet produced by anything (that's §48 step 14) or
 *    consumed (`commit-job.ts` — §48 step 15), but typed now so
 *    `parseJobMessage` has one authoritative place recognizing every shape
 *    this queue will ever carry, rather than gaining a second parser later.
 */

const s3EventRecordSchema = z.object({
  eventSource: z.literal("aws:s3"),
  s3: z.object({
    bucket: z.object({ name: z.string().min(1) }),
    object: z.object({ key: z.string().min(1) }),
  }),
});

const s3NotificationSchema = z.object({
  Records: z.array(s3EventRecordSchema).min(1),
});

const commitImportJobSchema = z.object({
  version: z.literal(1),
  jobType: z.literal("COMMIT_IMPORT"),
  importId: z.string().min(1),
  actorUserId: z.string().min(1),
});

export type PreviewJobMessage = {
  kind: "preview";
  bucket: string;
  key: string;
};
export type CommitJobMessage = {
  kind: "commit";
  importId: string;
  actorUserId: string;
};
export type ParsedJobMessage = PreviewJobMessage | CommitJobMessage;

/** S3 notification keys are form/URL-encoded (spaces as `+`, everything else percent-encoded) — decode before this key ever reaches `parseCurriculumImportObjectKey`. */
function decodeS3ObjectKey(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, " "));
}

export function parseJobMessage(body: string): ParsedJobMessage {
  const json: unknown = JSON.parse(body);

  const commitResult = commitImportJobSchema.safeParse(json);
  if (commitResult.success) {
    return {
      kind: "commit",
      importId: commitResult.data.importId,
      actorUserId: commitResult.data.actorUserId,
    };
  }

  const s3Result = s3NotificationSchema.safeParse(json);
  if (s3Result.success) {
    const record = s3Result.data.Records[0]!;
    return {
      kind: "preview",
      bucket: record.s3.bucket.name,
      key: decodeS3ObjectKey(record.s3.object.key),
    };
  }

  throw new Error("Unrecognized curriculum-import job message shape.");
}
