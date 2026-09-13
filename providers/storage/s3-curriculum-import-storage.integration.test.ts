import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

import { S3CurriculumImportStorage } from "./s3-curriculum-import-storage";

/**
 * Real AWS verification (spec 19 §46's "AWS integration tests" tier) —
 * exercises the actual dev S3 bucket created by
 * `infra/terraform/environments/dev`, not a mock. Skipped whenever
 * `IMPORT_BUCKET` isn't configured (every CI run today — this project has no
 * AWS credentials wired into CI yet, see `progress-tracker.md`), so this
 * never becomes a required, uncontrolled-network-dependent check. Run it
 * locally with real AWS credentials configured (`aws configure`) to verify
 * the provider against the real bucket.
 */
describe.skipIf(!process.env.IMPORT_BUCKET)("S3CurriculumImportStorage (real AWS)", () => {
  const bucket = process.env.IMPORT_BUCKET!;
  const region = process.env.AWS_REGION ?? "us-west-2";

  it("creates a presigned upload URL, accepts a real PUT, and the object is deletable", async () => {
    const storage = new S3CurriculumImportStorage({ bucket, region });
    const key = `imports/test-${crypto.randomUUID()}/source.csv`;
    const content = "word,translation,level,group\ncomer,to eat,1,1\n";

    const presigned = await storage.createPresignedUploadUrl({ key, contentType: "text/csv" });
    expect(presigned.bucket).toBe(bucket);
    expect(presigned.key).toBe(key);

    const putResponse = await fetch(presigned.url, { method: "PUT", headers: { "Content-Type": "text/csv" }, body: content });
    expect(putResponse.ok).toBe(true);

    const rawClient = new S3Client({ region });
    const getResult = await rawClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await getResult.Body?.transformToString();
    expect(body).toBe(content);

    await storage.deleteObject(key);

    await expect(rawClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).rejects.toBeInstanceOf(NoSuchKey);
  });

  it("deleteObject on a key that never existed is a harmless no-op", async () => {
    const storage = new S3CurriculumImportStorage({ bucket, region });
    await expect(storage.deleteObject(`imports/never-existed-${crypto.randomUUID()}/source.csv`)).resolves.toBeUndefined();
  });
});
