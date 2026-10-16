import {
  IMPORT_COLUMN_ALIASES,
  MAX_IMPORT_ROWS,
  REQUIRED_IMPORT_COLUMNS,
} from "@/domains/curriculum/vocabulary-import-parsing";

/**
 * What an Admin is told when a curriculum import goes wrong — and, above all,
 * **what to do about it**. Pure and free of server code, so the Server Actions,
 * the upload form and the import page can share it. Before this, every
 * failure the server did not anticipate reached the screen as "Something went
 * wrong. Please try again.", which is useless when the cause is a missing
 * setting or a bad header and trying again can never help.
 *
 * Nothing here repeats an error's own text back to the screen (an AWS error can
 * carry ARNs, a database error a connection string); each known cause gets a
 * fixed sentence naming the thing to change.
 */

const REQUIRED = REQUIRED_IMPORT_COLUMNS.join(", ");

/* -------------------------------------------------------------------------- */
/* A failure the server did not expect (Server Actions)                       */
/* -------------------------------------------------------------------------- */

export type ExplainedImportError = { code: string; message: string };

const SETTINGS_FIX =
  "add IMPORT_BUCKET, IMPORT_QUEUE_URL, AWS_REGION and AWS credentials to this environment's variables (on Vercel: Project → Settings → Environment Variables) and redeploy. On your own machine they come from .env.local.";

const CREDENTIAL_ERROR_NAMES = new Set([
  "CredentialsProviderError",
  "ExpiredToken",
  "ExpiredTokenException",
  "InvalidClientTokenId",
  "InvalidAccessKeyId",
  "UnrecognizedClientException",
  "SignatureDoesNotMatch",
]);

const DENIED_ERROR_NAMES = new Set([
  "AccessDenied",
  "AccessDeniedException",
  "AuthorizationHeaderMalformed",
]);

/** The error a Server Action caught and has no specific handling for, explained as far as its cause is known. */
export function explainUnexpectedImportError(
  error: unknown,
): ExplainedImportError {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (/IMPORT_BUCKET is not configured/i.test(message)) {
    return {
      code: "IMPORTS_NOT_CONFIGURED",
      message: `Imports aren't set up in this environment yet: the IMPORT_BUCKET setting is missing, so there is nowhere to upload the file. To fix it, ${SETTINGS_FIX}`,
    };
  }
  if (/IMPORT_QUEUE_URL is not configured/i.test(message)) {
    return {
      code: "IMPORTS_NOT_CONFIGURED",
      message: `Imports aren't fully set up in this environment: the IMPORT_QUEUE_URL setting is missing, so the import can't be started. To fix it, ${SETTINGS_FIX}`,
    };
  }
  if (
    CREDENTIAL_ERROR_NAMES.has(name) ||
    /could not load credentials/i.test(message)
  ) {
    return {
      code: "AWS_CREDENTIALS",
      message:
        "AWS didn't accept this environment's credentials (missing, wrong or expired). To fix it, check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or AWS_SESSION_TOKEN) in this environment's variables; on your own machine run `aws sso login` or refresh your keys. Then try again.",
    };
  }
  if (
    DENIED_ERROR_NAMES.has(name) ||
    /not authorized to perform/i.test(message)
  ) {
    return {
      code: "AWS_ACCESS_DENIED",
      message:
        "AWS refused the request: the credentials in use aren't allowed to use the import bucket or queue. To fix it, give that IAM user or role permission to upload to the import bucket and send to the import queue, then try again.",
    };
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(message)
  ) {
    return {
      code: "SERVICE_UNREACHABLE",
      message:
        "The server couldn't reach a service the import needs (the database or AWS). Check your connection and the service's status, then try again.",
    };
  }
  return {
    code: "UNKNOWN",
    message: `Something went wrong on the server and it didn't say why${/^[A-Za-z]{3,40}$/.test(name) && name !== "Error" ? ` (${name})` : ""}. Try again; if it keeps happening, the cause is in the server log — search for "Unexpected async import action error".`,
  };
}

/* -------------------------------------------------------------------------- */
/* The browser's own upload to storage                                        */
/* -------------------------------------------------------------------------- */

/** The upload itself: `status` and `body` when storage answered, nothing when the request never got an answer. */
export function explainUploadFailure(
  response: { status: number; body?: string } | null,
): string {
  if (!response) {
    return "The browser couldn't reach the upload storage. This is usually the import bucket's CORS setting (it must allow PUT from this site's address) or a lost connection. Check your connection and try again; if it repeats, check the bucket's CORS rules.";
  }
  const code = /<Code>([^<]+)<\/Code>/.exec(response.body ?? "")?.[1];
  switch (code) {
    case "AccessDenied":
      return "The storage refused the upload (AccessDenied). The upload link may have expired — choose the file again — or the credentials this site uses can't write to the import bucket.";
    case "ExpiredToken":
    case "ExpiredTokenException":
      return "The upload link expired (the credentials behind it did). Choose the file again; if it repeats, refresh this site's AWS credentials.";
    case "SignatureDoesNotMatch":
    case "InvalidAccessKeyId":
      return (
        "The storage rejected the upload's signature (" +
        code +
        "). This site's AWS credentials are wrong or have changed; check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, then try again."
      );
    case "RequestTimeTooSkewed":
      return "The storage rejected the upload because this computer's clock is off by more than a few minutes. Correct the date and time and try again.";
    case "EntityTooLarge":
      return "The file is larger than the storage will accept. Split it into smaller files.";
    default:
      return `The upload was refused by storage (HTTP ${response.status}${code ? `, ${code}` : ""}). Try again; if it repeats, check the import bucket's permissions and CORS rules.`;
  }
}

/* -------------------------------------------------------------------------- */
/* A file that cannot be read — caught in the browser before it is uploaded   */
/* -------------------------------------------------------------------------- */

/** Splits one line into cells, keeping a quoted cell (which may hold the delimiter) whole. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

/** A header the way the importer reads it: trimmed, lower-cased, spaces as underscores, then the accepted synonyms. */
function importerHeader(header: string): string {
  const normalized = header.trim().toLowerCase().replace(/\s+/g, "_");
  return IMPORT_COLUMN_ALIASES[normalized] ?? normalized;
}

/**
 * What is wrong with a file's first lines, if anything the importer would
 * refuse — or `null` (including whenever this cannot tell: the server's check
 * stays the authority). `head` is the start of the file's text.
 */
export function checkImportFileStart(
  head: string,
  fileExtension: "csv" | "tsv",
): string | null {
  const lines = head
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0)
    return "That file is empty. Add a header row and your data, then choose it again.";

  const delimiter = fileExtension === "tsv" ? "\t" : ",";
  const headers = splitLine(lines[0]!, delimiter)
    .map(importerHeader)
    .filter((header) => header !== "");
  const present = new Set(headers);
  const missing = REQUIRED_IMPORT_COLUMNS.filter(
    (column) => !present.has(column),
  );

  if (missing.length > 0) {
    const otherDelimiter = [";", "\t", ","].find(
      (candidate) =>
        candidate !== delimiter &&
        splitLine(lines[0]!, candidate)
          .map(importerHeader)
          .some((header) => header === "word" || header === "translation"),
    );
    if (otherDelimiter) {
      const shown =
        otherDelimiter === "\t"
          ? "tab"
          : otherDelimiter === ";"
            ? "semicolon"
            : "comma";
      return `This file looks ${shown}-separated, but it is a .${fileExtension} file. Export it as ${fileExtension === "csv" ? "CSV (comma-separated)" : "TSV (tab-separated)"}, or rename it to match what it really is.`;
    }
    return `This file's header row is missing the required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. The first row must name: ${REQUIRED} (capitals and spaces don't matter). It currently has: ${headers.join(", ") || "nothing readable"}.`;
  }
  if (lines.length < 2) {
    return "That file has a header row but no data rows. Add at least one row under the header, then choose it again.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* An import that failed after upload (the import's own page)                 */
/* -------------------------------------------------------------------------- */

/**
 * A "what to fix" sentence for a failed import, from the code and summary the
 * pipeline recorded — or `null` when there is nothing more useful to say than
 * the summary itself.
 */
export function explainImportFailure(
  code: string | null,
  summary: string | null,
): string | null {
  const text = summary ?? "";
  const missing = /^Missing required column\(s\): (.+?)\.?$/.exec(text)?.[1];
  if (missing) {
    return `The file's header row is missing: ${missing}. The first row must name ${REQUIRED} (capitals and spaces don't matter). Fix the header in your sheet and upload the file again — retrying the same file will fail the same way.`;
  }
  if (/over the import limit/i.test(text)) {
    return `A file can hold at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Split it into smaller files and upload them one at a time.`;
  }
  if (/no data rows/i.test(text)) {
    return "The file has no rows under its header. Add your data and upload it again.";
  }
  if (code === "IMPORT_PARSE_FAILED") {
    return "The file couldn't be read as a table. Check for a stray quote (\") or a row with more or fewer cells than the header, fix it in your sheet and upload the file again.";
  }
  if (code && /^S3_|READ_FAILED|NoSuchKey/i.test(`${code} ${text}`)) {
    return "The server couldn't read the uploaded file back from storage. Upload the file again.";
  }
  return null;
}
