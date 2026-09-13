import type { SQSEvent, SQSHandler } from "aws-lambda";

import { S3CurriculumImportStorage } from "@/providers/storage/s3-curriculum-import-storage";

import { createLambdaDb } from "./db";
import { parseJobMessage } from "./job-schema";
import { runPreviewJob } from "./preview-job";

/**
 * The curriculum-import Lambda's entry point (spec 19 §30, §48 step 9).
 * Deliberately thin: parse the message, decide the job type, hand off to
 * the application/domain service that does the real work. No curriculum,
 * import, or business logic lives here — see `preview-job.ts` (and, once
 * §48 step 15 ships, `commit-job.ts`) for that.
 *
 * SQS batch size is configured as 1 (spec 19 §37/Terraform), so
 * `event.Records` normally holds exactly one message — but this loops over
 * whatever arrives rather than assuming a single element, since nothing
 * about correctness depends on that assumption holding.
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  const db = createLambdaDb();

  for (const record of event.Records) {
    const message = parseJobMessage(record.body);

    if (message.kind === "preview") {
      const storage = new S3CurriculumImportStorage({ bucket: message.bucket, region: process.env.AWS_REGION ?? "us-west-2" });
      await runPreviewJob(db, storage, { bucket: message.bucket, key: message.key });
      continue;
    }

    // message.kind === "commit" — not yet implemented (spec 19 §48 step 15).
    // Nothing produces this message today (step 14), so this path is
    // unreached in practice; it throws rather than silently dropping the
    // message so SQS's normal retry/DLQ behavior applies if it ever is.
    throw new Error(`Job type "${message.kind}" is not yet implemented.`);
  }
};
