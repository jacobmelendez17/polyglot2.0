import type { SQSEvent, SQSHandler } from "aws-lambda";

import { S3CurriculumImportStorage } from "@/providers/storage/s3-curriculum-import-storage";

import { runCommitJob } from "./commit-job";
import { createLambdaDb } from "./db";
import { parseJobMessage } from "./job-schema";
import { runPreviewJob } from "./preview-job";

/**
 * The curriculum-import Lambda's entry point (spec 19 §30, §48 steps 9/15).
 * Deliberately thin: parse the message, decide the job type, hand off to
 * the application/domain service that does the real work. No curriculum,
 * import, or business logic lives here — see `preview-job.ts`/`commit-job.ts`
 * for that.
 *
 * SQS batch size is configured as 1 (spec 19 §37/Terraform), so
 * `event.Records` normally holds exactly one message — but this loops over
 * whatever arrives rather than assuming a single element, since nothing
 * about correctness depends on that assumption holding.
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  const db = await createLambdaDb();
  const region = process.env.AWS_REGION ?? "us-west-2";

  for (const record of event.Records) {
    const message = parseJobMessage(record.body);

    if (message.kind === "preview") {
      const storage = new S3CurriculumImportStorage({
        bucket: message.bucket,
        region,
      });
      await runPreviewJob(db, storage, {
        bucket: message.bucket,
        key: message.key,
      });
      continue;
    }

    await runCommitJob(
      db,
      (bucket) => new S3CurriculumImportStorage({ bucket, region }),
      { importId: message.importId, actorUserId: message.actorUserId },
    );
  }
};
