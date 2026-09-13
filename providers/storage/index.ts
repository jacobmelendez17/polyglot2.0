import "server-only";

import { S3CurriculumImportStorage } from "./s3-curriculum-import-storage";
import type { CurriculumImportStorage } from "./types";

/**
 * `IMPORT_BUCKET`/`AWS_REGION` are read directly, matching
 * `domains/lexicon/lexicon-source-config.ts`'s precedent, rather than added
 * to `lib/env.ts`'s strict schema: this is optional, feature-specific
 * configuration that has no safe default (there is no bucket to fall back
 * to), and `lib/env.ts` is transitively imported by most of the test suite —
 * adding a hard requirement there would break every test and every
 * developer's setup the moment this file merged, not just the ones that
 * touch curriculum import.
 */
let cachedStorage: CurriculumImportStorage | null = null;

function createCurriculumImportStorage(): CurriculumImportStorage {
  const bucket = process.env.IMPORT_BUCKET;
  if (!bucket) {
    throw new Error("IMPORT_BUCKET is not configured. Set it in .env.local — see .env.example.");
  }
  const region = process.env.AWS_REGION ?? "us-west-2";
  return new S3CurriculumImportStorage({ bucket, region });
}

/** The one entry point for curriculum-import storage (spec 19 §6/§41) — domain/application code never talks to the S3 SDK directly. */
export function getCurriculumImportStorage(): CurriculumImportStorage {
  cachedStorage ??= createCurriculumImportStorage();
  return cachedStorage;
}

export { curriculumImportObjectKey } from "./curriculum-import-object-key";
export type { CreatePresignedUploadInput, CurriculumImportStorage, PresignedUpload } from "./types";
