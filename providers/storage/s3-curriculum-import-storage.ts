import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  CreatePresignedUploadInput,
  CurriculumImportStorage,
  PresignedUpload,
} from "./types";

const DEFAULT_EXPIRES_IN_SECONDS = 300;

/**
 * The real AWS S3-backed implementation (spec 19 §6/§41). AWS credentials
 * come from the SDK's normal credential-resolution chain — `~/.aws/credentials`
 * locally, the Lambda execution role in production (spec 19 §42: "AWS
 * credentials are supplied through the Lambda execution role, never
 * environment variables") — never a key embedded here.
 *
 * No `"server-only"` guard here deliberately — that lives on `./index.ts`'s
 * factory (the real application entry point, which also reads `process.env`
 * directly). This class takes explicit constructor params and has nothing
 * Next.js/request-context-specific about it, which is what lets
 * `s3-curriculum-import-storage.integration.test.ts` construct it directly
 * to verify it against the real dev bucket — `server-only`'s guard throws
 * unconditionally under Vitest regardless of which export is used (see
 * `progress-tracker.md`'s note on `db/client.ts` for the same issue).
 */
export class S3CurriculumImportStorage implements CurriculumImportStorage {
  readonly bucketName: string;
  private readonly client: S3Client;

  constructor({ bucket, region }: { bucket: string; region: string }) {
    this.bucketName = bucket;
    this.client = new S3Client({ region });
  }

  async createPresignedUploadUrl({
    key,
    contentType,
    expiresInSeconds = DEFAULT_EXPIRES_IN_SECONDS,
  }: CreatePresignedUploadInput): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      url,
      bucket: this.bucketName,
      key,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  // S3's DeleteObject is already idempotent — it succeeds even when the key
  // doesn't exist (already expired via the lifecycle rule, or never
  // uploaded), so no existence check is needed first.
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
    );
  }

  async getObjectText(key: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
    );
    const text = await result.Body?.transformToString("utf-8");
    if (text === undefined) {
      throw new Error(
        `Object "${key}" in bucket "${this.bucketName}" has no body.`,
      );
    }
    return text;
  }
}
