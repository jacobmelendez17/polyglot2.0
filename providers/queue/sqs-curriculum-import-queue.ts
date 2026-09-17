import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import type { CurriculumImportQueue, SendCommitJobInput } from "./types";

/**
 * The real AWS SQS-backed implementation (spec 19 §11). Sends exactly the
 * small envelope `job-schema.ts`'s `commitImportJobSchema` expects — CSV
 * contents must never be embedded into SQS messages (§11), and this sends
 * only identifiers. AWS credentials come from the SDK's normal
 * credential-resolution chain, same as `S3CurriculumImportStorage`.
 *
 * No `"server-only"` guard here deliberately, matching
 * `s3-curriculum-import-storage.ts`'s reasoning — this class takes explicit
 * constructor params and has nothing Next.js-specific about it, which keeps
 * it directly constructible from a test.
 */
export class SqsCurriculumImportQueue implements CurriculumImportQueue {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor({ queueUrl, region }: { queueUrl: string; region: string }) {
    this.queueUrl = queueUrl;
    this.client = new SQSClient({ region });
  }

  async sendCommitJob({
    importId,
    actorUserId,
  }: SendCommitJobInput): Promise<void> {
    const body = JSON.stringify({
      version: 1,
      jobType: "COMMIT_IMPORT",
      importId,
      actorUserId,
    });
    await this.client.send(
      new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: body }),
    );
  }
}
