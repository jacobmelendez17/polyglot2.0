import "server-only";

import { SqsCurriculumImportQueue } from "./sqs-curriculum-import-queue";
import type { CurriculumImportQueue } from "./types";

/**
 * `IMPORT_QUEUE_URL` is read directly, matching `providers/storage/index.ts`'s
 * precedent — optional, feature-specific configuration with no safe
 * default, kept out of `lib/env.ts`'s strict schema so the rest of the test
 * suite never needs it set.
 */
let cachedQueue: CurriculumImportQueue | null = null;

function createCurriculumImportQueue(): CurriculumImportQueue {
  const queueUrl = process.env.IMPORT_QUEUE_URL;
  if (!queueUrl) {
    throw new Error("IMPORT_QUEUE_URL is not configured. Set it in .env.local — see .env.example.");
  }
  const region = process.env.AWS_REGION ?? "us-west-2";
  return new SqsCurriculumImportQueue({ queueUrl, region });
}

/** The one entry point for the curriculum-import commit queue (spec 19 §11) — domain/application code never talks to the SQS SDK directly. */
export function getCurriculumImportQueue(): CurriculumImportQueue {
  cachedQueue ??= createCurriculumImportQueue();
  return cachedQueue;
}

export type { CurriculumImportQueue, SendCommitJobInput } from "./types";
