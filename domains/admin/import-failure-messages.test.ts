import { describe, expect, it } from "vitest";

import {
  checkImportFileStart,
  explainImportFailure,
  explainUnexpectedImportError,
  explainUploadFailure,
} from "./import-failure-messages";

function named(name: string, message = "x") {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("explainUnexpectedImportError — a failure the server did not expect", () => {
  it("says the bucket setting is missing, and where to add it", () => {
    const result = explainUnexpectedImportError(
      new Error(
        "IMPORT_BUCKET is not configured. Set it in .env.local — see .env.example.",
      ),
    );
    expect(result.code).toBe("IMPORTS_NOT_CONFIGURED");
    expect(result.message).toContain("IMPORT_BUCKET");
    expect(result.message).toContain("Environment Variables");
    expect(result.message).toContain("IMPORT_QUEUE_URL");
  });

  it("says the queue setting is missing", () => {
    const result = explainUnexpectedImportError(
      new Error("IMPORT_QUEUE_URL is not configured."),
    );
    expect(result.code).toBe("IMPORTS_NOT_CONFIGURED");
    expect(result.message).toMatch(/^Imports aren't fully set up/);
    expect(result.message).toContain("IMPORT_QUEUE_URL");
  });

  it.each([
    "CredentialsProviderError",
    "ExpiredToken",
    "InvalidClientTokenId",
    "UnrecognizedClientException",
  ])("names AWS credentials for %s", (name) => {
    expect(explainUnexpectedImportError(named(name)).code).toBe(
      "AWS_CREDENTIALS",
    );
  });

  it("names AWS credentials when the SDK could not load any", () => {
    expect(
      explainUnexpectedImportError(
        new Error("Could not load credentials from any providers"),
      ).code,
    ).toBe("AWS_CREDENTIALS");
  });

  it.each([
    [named("AccessDenied")],
    [
      named(
        "Error",
        "User arn:aws:iam::1:user/x is not authorized to perform: s3:PutObject",
      ),
    ],
  ])("names a permissions problem, not the credentials", (error) => {
    expect(explainUnexpectedImportError(error).code).toBe("AWS_ACCESS_DENIED");
  });

  it("names an unreachable service", () => {
    expect(
      explainUnexpectedImportError(new Error("getaddrinfo ENOTFOUND x")).code,
    ).toBe("SERVICE_UNREACHABLE");
  });

  it("never repeats an error's own text — an ARN or a connection string stays out of the answer", () => {
    for (const secret of [
      "arn:aws:sqs:us-west-2:123456789012:private-queue",
      "postgres://user:hunter2@db.example.com/app",
      "AKIAIOSFODNN7EXAMPLE",
    ]) {
      for (const error of [
        new Error(`boom ${secret}`),
        named("AccessDenied", `denied ${secret}`),
        named("ExpiredToken", `expired ${secret}`),
        new Error(`IMPORT_BUCKET is not configured ${secret}`),
      ]) {
        expect(
          JSON.stringify(explainUnexpectedImportError(error)),
        ).not.toContain(secret);
      }
    }
  });

  it("says plainly that the cause is unknown, and where it is logged — with the error's kind when it has one", () => {
    expect(explainUnexpectedImportError(new Error("???"))).toEqual({
      code: "UNKNOWN",
      message: expect.stringMatching(
        /^Something went wrong on the server and it didn't say why\. .*server log/,
      ),
    });
    expect(
      explainUnexpectedImportError(named("NeonDbError")).message,
    ).toContain("(NeonDbError)");
  });

  it("copes with something that is not an Error at all", () => {
    expect(explainUnexpectedImportError(undefined).code).toBe("UNKNOWN");
    expect(explainUnexpectedImportError("a string").code).toBe("UNKNOWN");
  });
});

describe("explainUploadFailure — the browser's upload to storage", () => {
  it("blames CORS or the connection when storage never answered", () => {
    const message = explainUploadFailure(null);
    expect(message).toContain("CORS");
    expect(message).toContain("connection");
  });

  it.each([
    ["AccessDenied", /AccessDenied/],
    ["ExpiredToken", /expired/],
    ["SignatureDoesNotMatch", /signature/],
    ["RequestTimeTooSkewed", /clock/],
    ["EntityTooLarge", /larger than/],
  ])("explains S3's %s", (code, expected) => {
    expect(
      explainUploadFailure({
        status: 403,
        body: `<?xml version="1.0"?><Error><Code>${code}</Code><Message>m</Message></Error>`,
      }),
    ).toMatch(expected);
  });

  it("gives the status and S3's code when it has no special advice", () => {
    expect(
      explainUploadFailure({
        status: 500,
        body: "<Error><Code>InternalError</Code></Error>",
      }),
    ).toContain("HTTP 500, InternalError");
  });

  it("copes with an answer that has no body", () => {
    expect(explainUploadFailure({ status: 502 })).toContain("HTTP 502");
  });
});

describe("checkImportFileStart — a file the importer would refuse, caught before it is uploaded", () => {
  it("lets a good header through", () => {
    expect(
      checkImportFileStart(
        "word,translation,level,group\ngato,cat,1,1\n",
        "csv",
      ),
    ).toBeNull();
  });

  it("is not fussy about capitals, spaces, a byte-order mark, quotes, or the importer's own synonyms", () => {
    expect(
      checkImportFileStart(
        '﻿"Word", Translation ,Level,Batch Number\r\ngato,cat,1,1\r\n',
        "csv",
      ),
    ).toBeNull();
  });

  it("names the missing columns and what the file has instead", () => {
    const message = checkImportFileStart("word,meaning\ngato,cat\n", "csv");
    expect(message).toContain(
      "missing the required columns: translation, level, group",
    );
    expect(message).toContain("It currently has: word, meaning");
    expect(message).toContain("word, translation, level, group");
  });

  it("uses the singular for one missing column", () => {
    expect(
      checkImportFileStart("word,translation,level\ngato,cat,1\n", "csv"),
    ).toContain("missing the required column: group");
  });

  it("says a semicolon-separated file is not comma-separated", () => {
    expect(
      checkImportFileStart(
        "word;translation;level;group\ngato;cat;1;1\n",
        "csv",
      ),
    ).toMatch(/semicolon-separated.*\.csv.*CSV \(comma-separated\)/);
  });

  it("says a tab-separated file is not a CSV", () => {
    expect(
      checkImportFileStart(
        "word\ttranslation\tlevel\tgroup\ngato\tcat\t1\t1\n",
        "csv",
      ),
    ).toMatch(/tab-separated.*\.csv/);
  });

  it("reads a .tsv as tab-separated", () => {
    expect(
      checkImportFileStart(
        "word\ttranslation\tlevel\tgroup\ngato\tcat\t1\t1\n",
        "tsv",
      ),
    ).toBeNull();
  });

  it("does not split a quoted header cell on the delimiter inside it", () => {
    expect(
      checkImportFileStart(
        'word,translation,level,group,"notes, extra"\na,b,1,1,c\n',
        "csv",
      ),
    ).toBeNull();
  });

  it.each(["", "\n\n", "﻿"])("says an empty file is empty (%j)", (text) => {
    expect(checkImportFileStart(text, "csv")).toMatch(/empty/);
  });

  it("says a header with no rows has no rows", () => {
    expect(
      checkImportFileStart("word,translation,level,group\n", "csv"),
    ).toMatch(/no data rows/);
  });
});

describe("explainImportFailure — what to fix after an import failed", () => {
  it("names the missing columns, and says a retry cannot help", () => {
    const hint = explainImportFailure(
      "IMPORT_PARSE_FAILED",
      "Missing required column(s): level, group.",
    );
    expect(hint).toContain("missing: level, group");
    expect(hint).toContain("retrying the same file will fail the same way");
  });

  it("says how many rows a file may have", () => {
    expect(
      explainImportFailure(
        "IMPORT_PARSE_FAILED",
        "This file has 6000 rows, over the import limit.",
      ),
    ).toContain("5,000");
  });

  it("says a file with no rows has none", () => {
    expect(
      explainImportFailure("IMPORT_PARSE_FAILED", "The file has no data rows."),
    ).toMatch(/no rows under its header/);
  });

  it("points at quotes and cell counts for any other parse failure", () => {
    expect(
      explainImportFailure("IMPORT_PARSE_FAILED", "Quote Not Closed"),
    ).toMatch(/stray quote/);
  });

  it("asks for a re-upload when the file could not be read back", () => {
    expect(
      explainImportFailure(
        "S3_READ_FAILED",
        "The source file could not be read.",
      ),
    ).toMatch(/Upload the file again/);
  });

  it("has nothing to add when it does not know", () => {
    expect(
      explainImportFailure("IMPORT_PREVIEW_FAILED", "Failed query"),
    ).toBeNull();
    expect(explainImportFailure(null, null)).toBeNull();
  });
});
