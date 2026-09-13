import { describe, expect, it } from "vitest";

import { parseJobMessage } from "./job-schema";

function s3NotificationBody(bucket: string, key: string): string {
  return JSON.stringify({
    Records: [
      {
        eventVersion: "2.1",
        eventSource: "aws:s3",
        eventName: "ObjectCreated:Put",
        s3: { bucket: { name: bucket }, object: { key } },
      },
    ],
  });
}

describe("parseJobMessage", () => {
  it("recognizes a native S3 ObjectCreated notification as a preview job", () => {
    const result = parseJobMessage(s3NotificationBody("polyglot-dev-imports", "imports/abc/source.csv"));
    expect(result).toEqual({ kind: "preview", bucket: "polyglot-dev-imports", key: "imports/abc/source.csv" });
  });

  it("URL/form-decodes the S3 object key (S3 encodes spaces as '+', everything else percent-encoded)", () => {
    const result = parseJobMessage(s3NotificationBody("bucket", "imports/abc/my+file%20name.csv"));
    expect(result).toEqual({ kind: "preview", bucket: "bucket", key: "imports/abc/my file name.csv" });
  });

  it("recognizes the custom COMMIT_IMPORT envelope", () => {
    const body = JSON.stringify({ version: 1, jobType: "COMMIT_IMPORT", importId: "import-1", actorUserId: "user-1" });
    expect(parseJobMessage(body)).toEqual({ kind: "commit", importId: "import-1", actorUserId: "user-1" });
  });

  it("throws for a message matching neither known shape", () => {
    expect(() => parseJobMessage(JSON.stringify({ something: "else" }))).toThrow(/Unrecognized/);
  });

  it("throws for invalid JSON", () => {
    expect(() => parseJobMessage("not json")).toThrow();
  });
});
